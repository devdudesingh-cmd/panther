import "server-only";
import { z } from "zod";

/**
 * Server-side env access. Parsed lazily and per-group so `next build` works
 * without secrets, and a missing key fails loudly at the call site that needs
 * it (with the key's name) instead of as an undefined deep in a provider call.
 */

const str = z.string().min(1);
const optional = z.string().optional();

const groups = {
  site: z.object({
    NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
    ADMIN_EMAILS: z.string().default(""),
    CRON_SECRET: str,
  }),
  supabase: z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: str,
    SUPABASE_SECRET_KEY: str,
  }),
  stripe: z.object({
    STRIPE_SECRET_KEY: str,
    STRIPE_WEBHOOK_SECRET: str,
  }),
  google: z.object({
    GOOGLE_SERVICE_ACCOUNT_JSON: str,
    GOOGLE_IMPERSONATE_USER: z.email(),
    GOOGLE_CALENDAR_ID: z.string().default("primary"),
  }),
  resend: z.object({
    RESEND_API_KEY: str,
    EMAIL_FROM: str,
  }),
  twilio: z.object({
    TWILIO_ACCOUNT_SID: str,
    TWILIO_AUTH_TOKEN: str,
    TWILIO_FROM_NUMBER: str,
    ALERT_PHONE_NUMBER: str,
  }),
  recall: z.object({
    RECALL_API_KEY: str,
    RECALL_REGION: z.string().default("us-west-2"),
    RECALL_WEBHOOK_SECRET: optional,
    RECALL_BOT_NAME: z.string().default("Panther Assistant"),
  }),
  livekit: z.object({
    LIVEKIT_URL: str,
    LIVEKIT_API_KEY: str,
    LIVEKIT_API_SECRET: str,
  }),
  agent: z.object({
    AGENT_API_KEY: str,
    FRAMES_WS_SECRET: optional,
    NEXT_PUBLIC_FRAMES_WS_URL: optional,
  }),
} as const;

type Groups = typeof groups;
type EnvOf<K extends keyof Groups> = z.infer<Groups[K]>;

const cache = new Map<string, unknown>();

export function env<K extends keyof Groups>(group: K): EnvOf<K> {
  const hit = cache.get(group);
  if (hit) return hit as EnvOf<K>;
  const parsed = groups[group].safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env for "${group}": ${missing}. See .env.example.`);
  }
  cache.set(group, parsed.data);
  return parsed.data as EnvOf<K>;
}

/** True when the keys for a provider are present (lets dev/test run without every integration). */
export function hasEnv(group: keyof Groups): boolean {
  return groups[group].safeParse(process.env).success;
}

export function adminEmails(): string[] {
  return env("site")
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function siteUrl(): string {
  return env("site").NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}
