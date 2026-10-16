import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { config } from "@/config";
import { loadDashboard, requireParent } from "@/lib/dashboard";
import SessionCard from "@/components/dashboard/SessionCard";
import DeleteChildButton from "@/components/dashboard/DeleteChildButton";
import SignOutButton from "@/components/dashboard/SignOutButton";

export const metadata: Metadata = { title: "Your dashboard", robots: { index: false } };

export default function DashboardPage() {
  return (
    <main id="main" className="wrap flex-1 py-10 md:py-14">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const { user, parent } = await requireParent("/dashboard");
  const { now, upcoming, past, children } = await loadDashboard();
  const tz = parent?.timezone ?? "America/Los_Angeles";
  const byChild = new Map(children.map((c) => [c.id, c]));
  const first = parent?.full_name?.split(" ")[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Parent dashboard</p>
          <h1 className="text-display-md mt-3">{first ? `Hi, ${first}.` : "Hi there."}</h1>
          <p className="mt-2 text-ink-soft">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/book" className="btn btn-primary min-h-11">
            Book a session
          </Link>
          <SignOutButton />
        </div>
      </div>

      <section className="mt-10" aria-labelledby="up-title">
        <h2 id="up-title" className="display text-2xl font-extrabold tracking-tight">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <div className="card mt-4 p-6 text-ink-soft">
            Nothing booked yet.{" "}
            <Link href="/book" className="font-semibold text-red underline-offset-4 hover:underline">
              Find a time
            </Link>
            {config.sessions.freeTrialEnabled ? " — the first one's free." : "."}
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {upcoming.map((s) => (
              <SessionCard key={s.id} session={s} child={s.child_id ? (byChild.get(s.child_id) ?? null) : null} tz={tz} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="past-title">
        <h2 id="past-title" className="display text-2xl font-extrabold tracking-tight">
          Past sessions &amp; recaps
        </h2>
        {past.length === 0 ? (
          <p className="mt-4 text-ink-soft">Recaps and practice problems will show up here after each session.</p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {past.map((s) => {
              const child = s.child_id ? byChild.get(s.child_id) : null;
              const when = DateTime.fromISO(s.starts_at).setZone(tz);
              return (
                <li key={s.id} className="rounded-3xl border-2 border-ink bg-white p-5">
                  <p className="text-sm font-semibold text-ink-soft">
                    {when.toFormat("ccc, LLL d")} · {child?.first_name ?? "Your child"}
                    {s.topic ? ` · ${s.topic}` : ""}
                    {s.status === "cancelled" ? " · cancelled" : ""}
                  </p>
                  {s.recap ? (
                    <p className="mt-2 line-clamp-4 text-ink">{s.recap}</p>
                  ) : s.status === "cancelled" ? (
                    <p className="mt-2 text-ink-soft">{s.refunded_at ? "Refunded." : ""}</p>
                  ) : (
                    <p className="mt-2 text-ink-soft">Recap on its way.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                    <Link href={`/dashboard/s/${s.id}`} className="text-red underline-offset-4 hover:underline">
                      Details
                    </Link>
                    {s.practice?.length && s.practice_token ? (
                      <Link href={`/practice/${s.practice_token}`} className="text-red underline-offset-4 hover:underline">
                        Practice problems ({s.practice.length})
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="kids-title">
        <h2 id="kids-title" className="display text-2xl font-extrabold tracking-tight">
          Your kids &amp; their data
        </h2>
        <p className="mt-2 max-w-2xl text-ink-soft">
          We keep only a first name, grade, uploads and recaps. Delete any of it, any time — see the{" "}
          <Link href="/parent-notice" className="font-semibold text-red underline-offset-4 hover:underline">
            parent notice
          </Link>
          .
        </p>
        {children.length === 0 ? (
          <p className="mt-4 text-ink-soft">No child profiles yet.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-3">
            {children.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-white px-4 py-3">
                <span className="display font-extrabold">
                  {c.first_name} <span className="font-semibold text-ink-soft">· grade {c.grade}</span>
                </span>
                <DeleteChildButton childId={c.id} name={c.first_name} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <div className="h-4 w-32 rounded bg-line" />
      <div className="mt-4 h-12 w-64 rounded bg-line" />
      <div className="mt-10 h-32 rounded-3xl bg-line/60" />
    </div>
  );
}
