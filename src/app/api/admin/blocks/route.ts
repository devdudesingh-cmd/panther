import { connection, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { config } from "@/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, handleError, json, parseBody, requireAdmin, Unauthorized } from "@/lib/api";

const Body = z.object({
  /** "YYYY-MM-DDTHH:mm" in the business time zone */
  startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
  endLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
  reason: z.string().trim().max(120).nullable().optional(),
});

/** POST /api/admin/blocks — add a block-out (times interpreted in America/Los_Angeles). */
export async function POST(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin();
    const body = await parseBody(req, Body);
    const start = DateTime.fromISO(body.startLocal, { zone: config.businessHours.timeZone });
    const end = DateTime.fromISO(body.endLocal, { zone: config.businessHours.timeZone });
    if (!start.isValid || !end.isValid || end <= start) return fail(400, "INVALID", "End must be after start.");
    const { data, error } = await supabaseAdmin()
      .from("blocked_times")
      .insert({ starts_at: start.toUTC().toISO()!, ends_at: end.toUTC().toISO()!, reason: body.reason ?? null, created_by: admin.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return json(data, { status: 201 });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}

/** DELETE /api/admin/blocks?id=… */
export async function DELETE(req: NextRequest) {
  await connection();
  try {
    await requireAdmin();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail(400, "INVALID", "Missing id.");
    const { error } = await supabaseAdmin().from("blocked_times").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
