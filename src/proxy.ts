import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except static assets, images, the Recall bridge page and webhooks.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|bridge|api/stripe|api/recall|api/cron|api/agent|api/livekit|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico|txt|xml)$).*)"],
};
