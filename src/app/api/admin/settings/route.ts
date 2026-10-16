import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, handleError, json, parseBody, requireAdmin, Unauthorized } from "@/lib/api";

const Body = z.object({
  bookingsPaused: z.boolean(),
  pausedMessage: z.string().trim().max(200).nullable().optional(),
});

/** POST /api/admin/settings — pause/resume bookings site-wide. */
export async function POST(req: NextRequest) {
  await connection();
  try {
    await requireAdmin();
    const body = await parseBody(req, Body);
    const { error } = await supabaseAdmin()
      .from("app_settings")
      .update({ bookings_paused: body.bookingsPaused, paused_message: body.pausedMessage ?? null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return json({ ok: true, bookingsPaused: body.bookingsPaused });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
