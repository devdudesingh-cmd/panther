import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null = null;

/**
 * Service-role client. Bypasses RLS — server code only (API routes, webhooks,
 * cron, seed). Never import this from a client component.
 */
export function supabaseAdmin(): AdminClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. See .env.example.");
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
