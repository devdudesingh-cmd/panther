import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { ChildRow, ParentRow, SessionFileRow, SessionRow } from "@/lib/db/types";

/**
 * Data access for the parent dashboard. Runs as the signed-in parent through
 * RLS, so these queries can only ever return that family's rows.
 */
export async function requireParent(nextPath: string): Promise<{ user: { id: string; email: string }; parent: ParentRow | null }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { data: parent } = await supabase.from("parents").select("*").eq("id", user.id).maybeSingle();
  return { user: { id: user.id, email: user.email }, parent };
}

export async function loadDashboard() {
  const supabase = await supabaseServer();
  const nowIso = new Date().toISOString();
  const [{ data: upcoming }, { data: past }, { data: children }] = await Promise.all([
    supabase.from("sessions").select("*").in("status", ["confirmed", "held"]).gte("ends_at", nowIso).order("starts_at", { ascending: true }),
    supabase.from("sessions").select("*").in("status", ["completed", "confirmed", "cancelled"]).lt("ends_at", nowIso).order("starts_at", { ascending: false }).limit(20),
    supabase.from("children").select("*").order("created_at", { ascending: true }),
  ]);
  return {
    now: Date.now(),
    upcoming: (upcoming ?? []) as SessionRow[],
    past: ((past ?? []) as SessionRow[]).filter((s) => s.status !== "cancelled" || s.refunded_at),
    children: (children ?? []) as ChildRow[],
  };
}

export async function loadSession(id: string) {
  const supabase = await supabaseServer();
  const [{ data: session }, { data: files }] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).maybeSingle(),
    supabase.from("session_files").select("*").eq("session_id", id).order("created_at", { ascending: false }),
  ]);
  if (!session) return null;
  const { data: child } = session.child_id ? await supabase.from("children").select("*").eq("id", session.child_id).maybeSingle() : { data: null };
  return { now: Date.now(), session: session as SessionRow, files: (files ?? []) as SessionFileRow[], child: (child ?? null) as ChildRow | null };
}
