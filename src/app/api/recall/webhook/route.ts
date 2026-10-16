import { connection, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recallProvider, verifyRecallWebhook } from "@/lib/providers/recall";
import { twilioProvider } from "@/lib/providers/sms";
import { fail, json } from "@/lib/api";
import { config } from "@/config";

interface RecallStatusEvent {
  event: string; // e.g. "bot.joining_call", "bot.in_call_recording", "bot.done", "bot.fatal"
  data: {
    bot: { id: string; metadata?: Record<string, string> };
    data: { code: string; sub_code?: string | null; updated_at?: string };
  };
}

/**
 * POST /api/recall/webhook — bot status changes. Verified with the workspace
 * (or legacy Svix) secret, idempotent by message id. Keeps the admin "bot
 * status" column fresh and deletes any media Recall kept once the call ends.
 */
export async function POST(req: NextRequest) {
  await connection();
  const raw = await req.text();
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (secret && !verifyRecallWebhook(raw, req.headers, secret)) return fail(401, "BAD_SIGNATURE", "Invalid signature.");
  if (!secret) console.warn("[recall] RECALL_WEBHOOK_SECRET not set — accepting unverified webhook");

  let evt: RecallStatusEvent;
  try {
    evt = JSON.parse(raw) as RecallStatusEvent;
  } catch {
    return fail(400, "BAD_JSON", "Body must be JSON.");
  }
  const msgId = req.headers.get("webhook-id") ?? req.headers.get("svix-id") ?? `${evt.data?.bot?.id}:${evt.event}:${evt.data?.data?.updated_at ?? ""}`;
  const botId = evt.data?.bot?.id;
  const code = evt.data?.data?.code ?? evt.event?.replace(/^bot\./, "");
  if (!botId || !code) return fail(400, "BAD_EVENT", "Missing bot id or code.");

  const db = supabaseAdmin();
  const { error: dupErr } = await db
    .from("recall_events")
    .insert({ event_id: msgId, bot_id: botId, code, sub_code: evt.data?.data?.sub_code ?? null, payload: evt });
  if (dupErr?.code === "23505") return json({ received: true, duplicate: true });
  if (dupErr) console.error("[recall] log insert failed:", dupErr.message);

  const sessionId = evt.data.bot.metadata?.session_id;
  const query = sessionId ? db.from("sessions").select("id, recall_bot_id").eq("id", sessionId) : db.from("sessions").select("id, recall_bot_id").eq("recall_bot_id", botId);
  const { data: s } = await query.maybeSingle();

  if (s) {
    await db.from("sessions").update({ bot_status: code, bot_status_at: new Date().toISOString() }).eq("id", s.id);
  }

  if (code === "done" || code === "fatal") {
    // We never keep call audio/video: scrub anything Recall may have stored.
    try {
      await recallProvider().deleteMedia(botId);
    } catch (e) {
      console.error("[recall] delete_media failed:", e);
    }
  }
  if (code === "fatal") {
    try {
      await twilioProvider().alertOwner(
        `${config.brand.name}: tutor bot failed (${evt.data?.data?.sub_code ?? "fatal"})${s ? ` for session ${s.id.slice(0, 8)}` : ""}. Check /admin.`,
      );
    } catch (e) {
      console.error("[recall] alert failed:", e);
    }
  }
  return json({ received: true, session: s?.id ?? null, code });
}
