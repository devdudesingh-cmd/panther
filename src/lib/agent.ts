import "server-only";
import { config } from "@/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PracticeItem, SessionRow } from "@/lib/db/types";
import { resendProvider } from "@/lib/providers/email";
import { twilioProvider } from "@/lib/providers/sms";
import { recapReadyEmail } from "@/lib/email/templates";

/**
 * What the session assistant (the note-taking agent behind the Recall bot) is
 * allowed to know and do. Routes under /api/agent/* authenticate with
 * AGENT_API_KEY and call these.
 */

export interface SessionContext {
  id: string;
  kind: "trial" | "paid";
  status: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
  topic: string | null;
  child: { firstName: string; grade: number } | null;
  /** Signed, short-lived URLs for the parent's uploads (private bucket). */
  notes: { name: string; url: string; contentType: string | null }[];
  /** Earlier recaps for the same child, newest first — for continuity. */
  history: { date: string; topic: string | null; recap: string }[];
  assistantName: string;
  meetUrl: string | null;
}

export async function sessionContext(sessionId: string): Promise<SessionContext | null> {
  const db = supabaseAdmin();
  const { data: s } = await db.from("sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) return null;
  const session = s as SessionRow;

  const [{ data: child }, { data: files }] = await Promise.all([
    session.child_id ? db.from("children").select("first_name, grade").eq("id", session.child_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("session_files").select("file_name, storage_path, content_type").eq("session_id", session.id),
  ]);

  const notes: SessionContext["notes"] = [];
  for (const f of files ?? []) {
    const { data } = await db.storage.from("notes").createSignedUrl(f.storage_path, 3600);
    if (data?.signedUrl) notes.push({ name: f.file_name, url: data.signedUrl, contentType: f.content_type });
  }

  let history: SessionContext["history"] = [];
  if (session.child_id) {
    const { data: prev } = await db
      .from("sessions")
      .select("starts_at, topic, recap")
      .eq("child_id", session.child_id)
      .neq("id", session.id)
      .not("recap", "is", null)
      .order("starts_at", { ascending: false })
      .limit(3);
    history = (prev ?? []).map((p) => ({ date: p.starts_at, topic: p.topic, recap: p.recap! }));
  }

  return {
    id: session.id,
    kind: session.kind,
    status: session.status,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    minutes: Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000),
    topic: session.topic,
    child: child ? { firstName: child.first_name, grade: child.grade } : null,
    notes,
    history,
    assistantName: process.env.RECALL_BOT_NAME ?? config.tutoring.assistantName,
    meetUrl: session.meet_url,
  };
}

export async function saveRecap(sessionId: string, recap: string, practice: PracticeItem[]): Promise<{ emailed: boolean }> {
  const db = supabaseAdmin();
  const { data: s } = await db.from("sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) throw new Error("NOT_FOUND");
  const session = s as SessionRow;
  const alreadyEmailed = !!session.recap_ready_at;
  const ended = Date.parse(session.ends_at) < Date.now();

  const { error } = await db
    .from("sessions")
    .update({
      recap: recap.trim().slice(0, 4000),
      practice: practice.slice(0, 20),
      recap_ready_at: session.recap_ready_at ?? new Date().toISOString(),
      status: ended && session.status === "confirmed" ? "completed" : session.status,
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);

  if (alreadyEmailed) return { emailed: false };

  const [{ data: parent }, { data: child }] = await Promise.all([
    db.from("parents").select("email, full_name").eq("id", session.parent_id).maybeSingle(),
    session.child_id ? db.from("children").select("first_name").eq("id", session.child_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!parent) return { emailed: false };
  const fresh = { ...session, recap, practice } as SessionRow;
  await resendProvider().send({
    to: parent.email,
    ...recapReadyEmail({
      session: fresh,
      parentName: parent.full_name,
      childName: child?.first_name ?? null,
      siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    }),
  });
  return { emailed: true };
}

export async function raiseSafetyFlag(sessionId: string | null, severity: "low" | "medium" | "high", note: string): Promise<{ id: string }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("safety_flags")
    .insert({ session_id: sessionId, severity, note: note.trim().slice(0, 2000), raised_by: "agent" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (severity !== "low") {
    try {
      await twilioProvider().alertOwner(
        `${config.brand.name} safety flag (${severity})${sessionId ? ` on session ${sessionId.slice(0, 8)}` : ""}: ${note.slice(0, 200)} — review in /admin.`,
      );
      await db.from("safety_flags").update({ alerted_at: new Date().toISOString() }).eq("id", data.id);
    } catch (e) {
      console.error("[agent] alert failed:", e);
    }
  }
  return { id: data.id };
}
