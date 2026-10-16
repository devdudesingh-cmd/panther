import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { config, formatPrice } from "@/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/api";
import type { BlockedTimeRow, ChildRow, ParentRow, PaymentFailureRow, SafetyFlagRow, SessionRow } from "@/lib/db/types";
import { AdminCancelButton, BlockoutForm, DeleteBlockButton, PauseToggle, ResolveFlagButton } from "@/components/admin/AdminControls";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <main id="main" className="wrap flex-1 py-10 md:py-14">
      <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
        <Admin />
      </Suspense>
    </main>
  );
}

async function Admin() {
  const user = await currentUser();
  if (!user?.email) redirect("/login?next=%2Fadmin");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  const db = supabaseAdmin();
  const tz = config.businessHours.timeZone;
  const now = DateTime.now().setZone(tz);
  const dayStart = now.startOf("day").toUTC().toISO()!;
  const dayEnd = now.endOf("day").toUTC().toISO()!;
  const monthStart = now.startOf("month").toUTC().toISO()!;
  const weekAgo = now.minus({ days: 7 }).toUTC().toISO()!;

  const [{ data: today }, { data: paidThisMonth }, { data: refundedThisMonth }, { data: flags }, { data: failures }, { data: blocks }, { data: settings }, { data: upcomingCount }] =
    await Promise.all([
      db.from("sessions").select("*").gte("starts_at", dayStart).lte("starts_at", dayEnd).in("status", ["confirmed", "completed", "held", "cancelled"]).order("starts_at"),
      db.from("sessions").select("price_cents").gte("paid_at", monthStart).not("paid_at", "is", null),
      db.from("sessions").select("price_cents").gte("refunded_at", monthStart).not("refunded_at", "is", null),
      db.from("safety_flags").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
      db.from("payment_failures").select("*").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(20),
      db.from("blocked_times").select("*").gte("ends_at", now.toUTC().toISO()!).order("starts_at").limit(50),
      db.from("app_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("sessions").select("id", { count: "exact", head: true }).eq("status", "confirmed").gt("starts_at", dayEnd),
    ]);

  const sessions = (today ?? []) as SessionRow[];
  const parentIds = [...new Set(sessions.map((s) => s.parent_id))];
  const childIds = [...new Set(sessions.map((s) => s.child_id).filter(Boolean))] as string[];
  const [{ data: parents }, { data: children }] = await Promise.all([
    parentIds.length ? db.from("parents").select("id, email, full_name").in("id", parentIds) : Promise.resolve({ data: [] as Pick<ParentRow, "id" | "email" | "full_name">[] }),
    childIds.length ? db.from("children").select("id, first_name, grade").in("id", childIds) : Promise.resolve({ data: [] as Pick<ChildRow, "id" | "first_name" | "grade">[] }),
  ]);
  const parentById = new Map((parents ?? []).map((p) => [p.id, p]));
  const childById = new Map((children ?? []).map((c) => [c.id, c]));

  const revenue = (paidThisMonth ?? []).reduce((a, s) => a + s.price_cents, 0) - (refundedThisMonth ?? []).reduce((a, s) => a + s.price_cents, 0);
  const openFlags = (flags ?? []) as SafetyFlagRow[];
  const fails = (failures ?? []) as PaymentFailureRow[];
  const blockouts = (blocks ?? []) as BlockedTimeRow[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="text-display-md mt-3">{now.toFormat("cccc, LLLL d")}</h1>
          <p className="mt-1 text-sm text-ink-soft">All times {now.toFormat("ZZZZ")} · signed in as {user.email}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Sessions today" value={String(sessions.filter((s) => s.status === "confirmed" || s.status === "completed").length)} />
        <Kpi label="Revenue this month" value={formatPrice(Math.max(0, revenue))} sub="paid minus refunds" />
        <Kpi label="Open safety flags" value={String(openFlags.length)} tone={openFlags.some((f) => f.severity === "high") ? "alert" : undefined} />
        <Kpi label="Upcoming (after today)" value={String((upcomingCount as unknown as { count?: number } | null)?.count ?? (upcomingCount ? (upcomingCount as unknown[]).length : 0))} sub={`${fails.length} failed payment${fails.length === 1 ? "" : "s"} this week`} />
      </div>

      <div className="mt-8">
        <PauseToggle paused={settings?.bookings_paused ?? false} message={settings?.paused_message ?? null} />
      </div>

      <section className="mt-10" aria-labelledby="today-title">
        <h2 id="today-title" className="display text-2xl font-extrabold tracking-tight">
          Today&apos;s sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-ink-soft">Nothing on the calendar today.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-3xl border-2 border-ink bg-white">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Kid</th>
                  <th className="px-4 py-3">Parent</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Bot</th>
                  <th className="px-4 py-3">Meet</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const p = parentById.get(s.parent_id);
                  const c = s.child_id ? childById.get(s.child_id) : null;
                  return (
                    <tr key={s.id} className="border-t border-line">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">{DateTime.fromISO(s.starts_at).setZone(tz).toFormat("h:mm a")}</td>
                      <td className="px-4 py-3">{c ? `${c.first_name} (gr ${c.grade})` : "—"}{s.topic ? <span className="block text-xs text-ink-soft">{s.topic}</span> : null}</td>
                      <td className="px-4 py-3">{p?.full_name ?? ""}<span className="block text-xs text-ink-soft">{p?.email}</span></td>
                      <td className="px-4 py-3">{s.kind}</td>
                      <td className="px-4 py-3"><Badge text={s.status} /></td>
                      <td className="px-4 py-3"><BotBadge status={s.bot_status} fulfilled={!!s.fulfilled_at} error={s.fulfillment_error} /></td>
                      <td className="px-4 py-3">{s.meet_url ? <a className="font-semibold text-red underline-offset-4 hover:underline" href={s.meet_url} target="_blank" rel="noopener">Open</a> : "—"}</td>
                      <td className="px-4 py-3">{s.status === "confirmed" ? <AdminCancelButton sessionId={s.id} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="flags-title">
          <h2 id="flags-title" className="display text-2xl font-extrabold tracking-tight">
            Safety flags
          </h2>
          {openFlags.length === 0 ? (
            <p className="mt-3 text-ink-soft">No open flags.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {openFlags.map((f) => (
                <li key={f.id} className={`rounded-2xl border-2 border-ink p-4 ${f.severity === "high" ? "bg-blush" : "bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-red">{f.severity} · {DateTime.fromISO(f.created_at).setZone(tz).toFormat("LLL d, h:mm a")}</p>
                      <p className="mt-1">{f.note}</p>
                      {f.session_id ? <p className="mt-1 text-xs text-ink-soft">session {f.session_id.slice(0, 8)} · {f.alerted_at ? "texted" : "not texted"}</p> : null}
                    </div>
                    <ResolveFlagButton id={f.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="fail-title">
          <h2 id="fail-title" className="display text-2xl font-extrabold tracking-tight">
            Failed payments (7 days)
          </h2>
          {fails.length === 0 ? (
            <p className="mt-3 text-ink-soft">None.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-2xl border-2 border-ink bg-white">
              {fails.map((f) => (
                <li key={f.id} className="px-4 py-3 text-sm">
                  <span className="font-semibold">{DateTime.fromISO(f.created_at).setZone(tz).toFormat("LLL d, h:mm a")}</span> · {f.reason ?? "payment failed"}
                  <span className="block text-xs text-ink-soft">{f.stripe_object_id} {f.session_id ? `· session ${f.session_id.slice(0, 8)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10" aria-labelledby="blocks-title">
        <h2 id="blocks-title" className="display text-2xl font-extrabold tracking-tight">
          Block out times
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Blocked ranges disappear from the parents&apos; calendar. Existing bookings inside a block aren&apos;t cancelled automatically.</p>
        <div className="card mt-4 p-5">
          <BlockoutForm />
        </div>
        {blockouts.length ? (
          <ul className="mt-4 divide-y divide-line rounded-2xl border-2 border-ink bg-white">
            {blockouts.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold">
                    {DateTime.fromISO(b.starts_at).setZone(tz).toFormat("ccc, LLL d · h:mm a")} → {DateTime.fromISO(b.ends_at).setZone(tz).toFormat("ccc, LLL d · h:mm a")}
                  </span>
                  {b.reason ? <span className="block text-xs text-ink-soft">{b.reason}</span> : null}
                </span>
                <DeleteBlockButton id={b.id} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "alert" }) {
  return (
    <div className={`rounded-3xl border-2 border-ink p-5 ${tone === "alert" ? "bg-blush" : "bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="display mt-2 text-4xl font-extrabold tracking-tight">{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-soft">{sub}</p> : null}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  const tone = text === "confirmed" ? "bg-mint" : text === "completed" ? "bg-cream" : text === "cancelled" ? "bg-blush" : "bg-sun";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{text}</span>;
}

function BotBadge({ status, fulfilled, error }: { status: string | null; fulfilled: boolean; error: string | null }) {
  if (error) return <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs font-bold text-red-deep" title={error}>fulfillment error</span>;
  if (!status) return <span className="text-xs text-ink-soft">{fulfilled ? "—" : "pending"}</span>;
  const tone = status.includes("in_call") ? "bg-mint" : status === "fatal" ? "bg-blush text-red-deep" : "bg-cream";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{status}</span>;
}
