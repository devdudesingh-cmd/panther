import { connection, type NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { env, hasEnv } from "@/lib/env";
import { bearerMatches, fail, handleError, json, parseBody } from "@/lib/api";
import { verifyBridgeToken } from "@/lib/bridge-token";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Body = z.object({
  session: z.uuid(),
  role: z.enum(["bridge", "agent"]),
  /** Signed bridge token (role=bridge). Agents authenticate with AGENT_API_KEY instead. */
  token: z.string().optional(),
});

/**
 * POST /api/livekit/token
 * Mints a LiveKit access token for the session's room. The room name is the
 * session id (opaque, no PII) and identities are role-based.
 *  - bridge: the page the Recall bot renders in the Meet; publishes meeting
 *    audio, subscribes to the assistant's voice (if it ever speaks).
 *  - agent: the session assistant; subscribes to the meeting audio to take notes.
 */
export async function POST(req: NextRequest) {
  await connection();
  try {
    if (!hasEnv("livekit")) return fail(503, "NOT_CONFIGURED", "LiveKit is not configured.");
    const { session, role, token } = await parseBody(req, Body);

    const authorized = role === "agent" ? bearerMatches(req, process.env.AGENT_API_KEY) : verifyBridgeToken(session, token);
    if (!authorized) return fail(401, "UNAUTHORIZED", "Bad token.");

    const { data: s } = await supabaseAdmin().from("sessions").select("id, status, starts_at, ends_at").eq("id", session).maybeSingle();
    if (!s || (s.status !== "confirmed" && s.status !== "completed")) return fail(404, "NOT_FOUND", "No active session.");
    // Only valid from 15 minutes before the start until an hour after the end.
    const now = Date.now();
    if (now < Date.parse(s.starts_at) - 15 * 60_000 || now > Date.parse(s.ends_at) + 60 * 60_000) {
      return fail(403, "OUTSIDE_WINDOW", "This session isn't live right now.");
    }

    const lk = env("livekit");
    const at = new AccessToken(lk.LIVEKIT_API_KEY, lk.LIVEKIT_API_SECRET, {
      identity: role === "agent" ? `agent-${s.id.slice(0, 8)}` : `bridge-${s.id.slice(0, 8)}`,
      ttl: "2h",
    });
    at.addGrant({ room: s.id, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return json({ url: lk.LIVEKIT_URL, token: await at.toJwt(), room: s.id });
  } catch (e) {
    return handleError(e);
  }
}
