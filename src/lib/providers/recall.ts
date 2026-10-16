import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { signBridgeToken } from "@/lib/bridge-token";

/**
 * Recall.ai: the bot that brings the tutor into the Google Meet. The bot's
 * camera renders our /bridge page (Output Media), which talks to the tutor
 * agent over LiveKit. Optionally, the bot also streams per-participant video
 * frames + mixed audio to the realtime frames service (never stored).
 *
 * Bots scheduled >10 min ahead are guaranteed to join on time; our minimum
 * lead time (config.sessions.minLeadMinutes) keeps every bot in that class.
 */

export interface TutorBotProvider {
  schedule(input: { sessionId: string; meetUrl: string; joinAt: string }): Promise<{ botId: string }>;
  /** Cancel a scheduled bot, or make it leave if it's already dispatched. */
  cancel(botId: string): Promise<void>;
  /** Recall keeps recordings only if asked; we delete whatever exists after the call. */
  deleteMedia(botId: string): Promise<void>;
}

function base(): string {
  return `https://${env("recall").RECALL_REGION}.recall.ai/api/v1`;
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${base()}${path}`, {
    ...rest,
    headers: {
      authorization: `Token ${env("recall").RECALL_API_KEY}`,
      accept: "application/json",
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Recall ${rest.method ?? "GET"} ${path} → ${res.status} ${text}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** The Create Bot payload for a session — exported so tests can check it without network. */
export function buildBotRequest(input: { sessionId: string; meetUrl: string; joinAt: string }, opts: { siteUrl: string; botName: string; framesWsUrl?: string | null }) {
  const token = signBridgeToken(input.sessionId, 8 * 3600);
  const bridgeUrl = `${opts.siteUrl}/bridge?session=${encodeURIComponent(input.sessionId)}&t=${encodeURIComponent(token)}`;
  const frames = opts.framesWsUrl ? `${opts.framesWsUrl.replace(/\/$/, "")}/ingest?session=${encodeURIComponent(input.sessionId)}&t=${encodeURIComponent(token)}` : null;

  return {
    meeting_url: input.meetUrl,
    bot_name: opts.botName,
    join_at: input.joinAt,
    metadata: { session_id: input.sessionId },
    // The bot's camera shows /bridge: the tutor's face and voice.
    output_media: {
      camera: { kind: "webpage", config: { url: bridgeUrl } },
    },
    recording_config: {
      // No stored artifacts: nothing but realtime streams is requested, and
      // whatever Recall keeps internally is deleted after the call. Shortest
      // allowed retention as a backstop.
      retention: { type: "timed", hours: 1 },
      ...(frames
        ? {
            realtime_endpoints: [
              {
                type: "websocket",
                url: frames,
                events: ["video_separate_png.data", "audio_mixed_raw.data", "participant_events.join", "participant_events.leave"],
              },
            ],
          }
        : {}),
    },
    // Leave when the family leaves; don't sit in an empty call.
    automatic_leave: {
      waiting_room_timeout: 1200,
      noone_joined_timeout: 1200,
      everyone_left_timeout: 60,
    },
  };
}

export function recallProvider(): TutorBotProvider {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    async schedule(input) {
      const bot = await call<{ id: string }>("/bot/", {
        method: "POST",
        json: buildBotRequest(input, {
          siteUrl,
          botName: env("recall").RECALL_BOT_NAME,
          framesWsUrl: process.env.NEXT_PUBLIC_FRAMES_WS_URL || null,
        }),
      });
      return { botId: bot.id };
    },

    async cancel(botId) {
      try {
        // Only works for scheduled bots that haven't started joining.
        await call(`/bot/${botId}/`, { method: "DELETE" });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404) return;
        // Already dispatched: ask it to leave instead.
        await call(`/bot/${botId}/leave_call/`, { method: "POST" }).catch((e2) => {
          if ((e2 as { status?: number }).status !== 404) throw e2;
        });
      }
    },

    async deleteMedia(botId) {
      await call(`/bot/${botId}/delete_media/`, { method: "POST" }).catch((e) => {
        const status = (e as { status?: number }).status;
        if (status !== 404 && status !== 400) throw e;
      });
    },
  };
}

/**
 * Verify a request from Recall (webhooks, websocket upgrades, callbacks).
 * Newer workspaces send webhook-id/-timestamp/-signature; legacy Svix
 * endpoints send svix-* headers. Same HMAC scheme: v1,<base64(hmac(id.ts.body))>.
 * For websocket upgrade requests pass "" as the body.
 */
export function verifyRecallWebhook(rawBody: string, headers: Headers, secret: string, now = Date.now()): boolean {
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const ts = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const sigHeader = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  const skew = Math.abs(now / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
