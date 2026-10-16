import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /auth/callback — lands magic links. Supports both the PKCE `code` flow
 * and the `token_hash` flow, then sends the parent on to `next`.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextPath = safeNext(url.searchParams.get("next"));

  const supabase = await supabaseServer();
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const dest = url.clone();
  dest.search = "";
  dest.pathname = ok ? nextPath : "/login";
  if (!ok) dest.search = `?error=link&next=${encodeURIComponent(nextPath)}`;
  return NextResponse.redirect(dest);
}

/** Only allow same-origin relative paths. */
function safeNext(v: string | null): string {
  if (!v || !v.startsWith("/") || v.startsWith("//")) return "/dashboard";
  return v;
}
