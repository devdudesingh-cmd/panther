import type { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, handleError, json, parseBody, requireUser, Unauthorized } from "@/lib/api";

const Body = z.object({ childId: z.uuid() });

/**
 * POST /api/account/delete-child — "Delete my child's data".
 * Removes uploads from storage, then runs delete_child_data() which scrubs the
 * child row and anything describing them. Trial-claim hashes are kept so a
 * family can't reset its free trial this way.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { childId } = await parseBody(req, Body);
    const db = supabaseAdmin();

    const { data: child } = await db.from("children").select("id").eq("id", childId).eq("parent_id", user.id).maybeSingle();
    if (!child) return fail(404, "NOT_FOUND", "We couldn't find that child profile.");

    const { data: sessions } = await db.from("sessions").select("id").eq("parent_id", user.id).eq("child_id", childId);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length) {
      const { data: files } = await db.from("session_files").select("storage_path").in("session_id", sessionIds);
      const paths = (files ?? []).map((f) => f.storage_path);
      if (paths.length) await db.storage.from("notes").remove(paths);
    }

    const { error } = await db.rpc("delete_child_data", { p_parent_id: user.id, p_child_id: childId });
    if (error) throw new Error(error.message);
    return json({ ok: true, sessionsScrubbed: sessionIds.length });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
