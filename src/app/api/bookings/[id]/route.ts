import { connection, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, handleError, json, requireUser, Unauthorized } from "@/lib/api";

/**
 * GET /api/bookings/:id — status for the post-checkout page to poll.
 * Never confirms anything; it only reports what the webhook has done.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { data: s } = await supabaseAdmin()
      .from("sessions")
      .select("id, parent_id, kind, status, starts_at, ends_at, meet_url, parent_timezone, cancel_reason, fulfilled_at")
      .eq("id", id)
      .maybeSingle();
    if (!s || s.parent_id !== user.id) return fail(404, "NOT_FOUND", "We couldn't find that session.");
    return json(
      {
        id: s.id,
        kind: s.kind,
        status: s.status,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        meetUrl: s.status === "confirmed" || s.status === "completed" ? s.meet_url : null,
        parentTz: s.parent_timezone,
        cancelReason: s.cancel_reason,
        fulfilled: !!s.fulfilled_at,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
