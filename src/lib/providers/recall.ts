import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Recall.ai: the bot that brings the tutor into the Google Meet. The bot's
 * camera renders our /bridge page (Output Media), which talks to the tutor
 * agent over LiveKit / the frames websocket.
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

export function recallProvider(): TutorBotProvider {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    async schedule({ sessionId, meetUrl, joinAt }) {
      const bot = await call<{ id: string }>("/bot/", {
        method: "POST",
        json: {
          meeting_url: meetUrl,
          bot_name: env("recall").RECALL_BOT_NAME,
          join_at: joinAt,
          metadata: { session_id: sessionId },
          // The bot's camera shows /bridge, which renders the tutor and plays its voice.
          output_media: {
            camera: { kind: "webpage", config: { url: `${siteUrl}/bridge?session=${encodeURIComponent(sessionId)}` } },
          },
          // We never keep call audio or video. Leave when the family leaves.
          automatic_leave: {
            waiting_room_timeout: 1200,
            noone_joined_timeout: 1200,
            everyone_left_timeout: 60,
          },
        },
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
 * Verify a Recall status-change webhook (Svix signature scheme).
 * Headers: svix-id, svix-timestamp, svix-signature ("v1,<base64>" list).
 */
export function verifyRecallWebhook(rawBody: string, headers: Headers, secret: string, now = Date.now()): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
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
