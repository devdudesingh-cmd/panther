import { connection, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, handleError, json, requireAdmin, Unauthorized } from "@/lib/api";

/** POST /api/admin/flags/:id — mark a safety flag resolved. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { error } = await supabaseAdmin().from("safety_flags").update({ resolved_at: new Date().toISOString(), resolved_by: admin.id }).eq("id", id);
    if (error) throw new Error(error.message);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
