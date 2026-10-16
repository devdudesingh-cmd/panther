/**
 * Panther realtime frames relay.
 *
 * Netlify functions can't hold a websocket open, so this tiny Node service
 * does, forwarding the Meet's frames/audio to the session assistant (the
 * note-taker). Deploy anywhere that runs long-lived processes (Fly.io, Render,
 * Railway, a VPS).
 *
 * Endpoints:
 *   GET /healthz
 *   WS  /ingest?session=<id>&t=<bridge token>   ← Recall.ai realtime websocket
 *        Events: video_separate_png.data, audio_mixed_raw.data, participant_events.*
 *        Verified by the bridge token in the URL and, when RECALL_WEBHOOK_SECRET is
 *        set, by Recall's webhook-* / svix-* HMAC headers on the upgrade request.
 *   WS  /subscribe?session=<id>&key=<AGENT_API_KEY>  ← the session assistant agent
 *        Receives the same JSON events, verbatim, in real time.
 *
 * Privacy: frames and audio live in memory for the milliseconds it takes to
 * forward them. Nothing is logged beyond counts, nothing is persisted.
 */
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const FRAMES_WS_SECRET = process.env.FRAMES_WS_SECRET || process.env.AGENT_API_KEY;
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const RECALL_WEBHOOK_SECRET = process.env.RECALL_WEBHOOK_SECRET;

if (!FRAMES_WS_SECRET || !AGENT_API_KEY) {
  console.error("FRAMES_WS_SECRET (or AGENT_API_KEY) and AGENT_API_KEY are required");
  process.exit(1);
}

/** Same scheme as src/lib/bridge-token.ts */
export function verifyBridgeToken(sessionId, token, now = Date.now()) {
  if (!token) return false;
  const [expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !mac || exp * 1000 < now) return false;
  const expected = createHmac("sha256", FRAMES_WS_SECRET).update(`${sessionId}.${exp}`).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recall's HMAC on the upgrade request (empty payload). */
export function verifyRecallUpgrade(headers, secret, now = Date.now()) {
  const id = headers["webhook-id"] ?? headers["svix-id"];
  const ts = headers["webhook-timestamp"] ?? headers["svix-timestamp"];
  const sig = headers["webhook-signature"] ?? headers["svix-signature"];
  if (!id || !ts || !sig) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.`).digest();
  return String(sig).split(" ").some((part) => {
    const [v, s] = part.split(",");
    if (v !== "v1" || !s) return false;
    const given = Buffer.from(s, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function constantTimeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** session id → Set<WebSocket> of agent subscribers */
const subscribers = new Map();
const stats = { ingest: 0, frames: 0, audio: 0, participants: 0 };

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessions: subscribers.size, ...stats }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  const session = url.searchParams.get("session");
  if (!session || !/^[0-9a-f-]{36}$/.test(session)) return reject(socket, 400);

  if (url.pathname === "/ingest") {
    if (!verifyBridgeToken(session, url.searchParams.get("t"))) return reject(socket, 401);
    if (RECALL_WEBHOOK_SECRET && !verifyRecallUpgrade(req.headers, RECALL_WEBHOOK_SECRET)) return reject(socket, 401);
    wss.handleUpgrade(req, socket, head, (ws) => onIngest(ws, session));
    return;
  }
  if (url.pathname === "/subscribe") {
    if (!constantTimeEqual(url.searchParams.get("key") ?? "", AGENT_API_KEY)) return reject(socket, 401);
    wss.handleUpgrade(req, socket, head, (ws) => onSubscribe(ws, session));
    return;
  }
  reject(socket, 404);
});

function reject(socket, code) {
  socket.write(`HTTP/1.1 ${code} ${code === 401 ? "Unauthorized" : code === 404 ? "Not Found" : "Bad Request"}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function onIngest(ws, session) {
  stats.ingest++;
  console.log(`[ingest] bot connected for session ${session.slice(0, 8)}`);
  const keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.ping(), 25_000);
  ws.on("message", (data) => {
    // Recall sends JSON text frames: { event, data: { data: { buffer: <base64>, timestamp }, participant, ... } }
    let evt;
    try {
      evt = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (evt?.event?.startsWith("video_separate")) stats.frames++;
    else if (evt?.event?.startsWith("audio_")) stats.audio++;
    else if (evt?.event?.startsWith("participant_events")) stats.participants++;
    const subs = subscribers.get(session);
    if (!subs?.size) return; // nobody listening: drop on the floor, never buffer
    const out = typeof data === "string" ? data : data.toString();
    for (const s of subs) if (s.readyState === WebSocket.OPEN) s.send(out);
  });
  ws.on("close", () => {
    clearInterval(keepAlive);
    const subs = subscribers.get(session);
    if (subs) for (const s of subs) if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ event: "panther.ingest_closed", session }));
    console.log(`[ingest] bot disconnected for session ${session.slice(0, 8)}`);
  });
}

function onSubscribe(ws, session) {
  if (!subscribers.has(session)) subscribers.set(session, new Set());
  subscribers.get(session).add(ws);
  console.log(`[subscribe] agent joined session ${session.slice(0, 8)} (${subscribers.get(session).size} subscriber(s))`);
  ws.send(JSON.stringify({ event: "panther.subscribed", session }));
  const keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.ping(), 25_000);
  ws.on("close", () => {
    clearInterval(keepAlive);
    const subs = subscribers.get(session);
    subs?.delete(ws);
    if (subs && subs.size === 0) subscribers.delete(session);
  });
}

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => console.log(`panther-realtime listening on :${PORT}`));
}

export { server, wss, subscribers };
