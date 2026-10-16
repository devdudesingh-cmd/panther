import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { config } from "@/config";
import { loadSession, requireParent } from "@/lib/dashboard";
import Uploads from "@/components/dashboard/Uploads";
import CancelButton from "@/components/dashboard/CancelButton";
import RescheduleDialog from "@/components/dashboard/RescheduleDialog";

export const metadata: Metadata = { title: "Session", robots: { index: false } };

// `params` resolves at request time, so it's awaited inside the Suspense boundary.
export default function SessionPage({ params }: PageProps<"/dashboard/s/[id]">) {
  return (
    <main id="main" className="wrap flex-1 py-10 md:py-14">
      <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
        <SessionDetail params={params} />
      </Suspense>
    </main>
  );
}

async function SessionDetail({ params }: { params: PageProps<"/dashboard/s/[id]">["params"] }) {
  const { id } = await params;
  const { user, parent } = await requireParent(`/dashboard/s/${id}`);
  const data = await loadSession(id);
  if (!data) notFound();
  const { now, session: s, files, child } = data;
  const tz = parent?.timezone ?? s.parent_timezone;
  const start = DateTime.fromISO(s.starts_at).setZone(tz);
  const hours = (Date.parse(s.starts_at) - now) / 3_600_000;
  const canChange = s.status === "confirmed" && hours >= config.sessions.freeCancelHours;
  const upcoming = s.status === "confirmed" && Date.parse(s.ends_at) > now;

  return (
    <>
      <Link href="/dashboard" className="text-sm font-semibold text-red underline-offset-4 hover:underline">
        ← Dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{s.kind === "trial" ? "Free trial" : "Session"} · {statusLabel(s.status)}</p>
          <h1 className="text-display-sm mt-3">
            {start.toFormat("cccc, LLLL d")} · {start.toFormat("h:mm a ZZZZ")}
          </h1>
          <p className="mt-2 text-ink-soft">
            {child ? `${child.first_name}, grade ${child.grade}` : "Your child"}
            {s.topic ? ` · ${s.topic}` : ""}
          </p>
        </div>
        {upcoming ? (
          <div className="flex flex-wrap gap-2">
            <RescheduleDialog sessionId={s.id} kind={s.kind} tz={tz} disabled={!canChange} />
            <CancelButton sessionId={s.id} refundable={s.kind === "paid" && canChange} tooLate={!canChange} />
          </div>
        ) : null}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <section className="card p-6" aria-labelledby="notes-title">
          <h2 id="notes-title" className="display text-xl font-extrabold tracking-tight">
            Notes &amp; homework
          </h2>
          <p className="mt-1 text-sm text-ink-soft">The tutor reads these before the session.</p>
          <div className="mt-4">
            <Uploads sessionId={s.id} parentId={user.id} files={files} locked={!upcoming} />
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-6" aria-labelledby="meet-title">
            <h2 id="meet-title" className="display text-xl font-extrabold tracking-tight">
              Google Meet
            </h2>
            {s.meet_url ? (
              <>
                <a href={s.meet_url} target="_blank" rel="noopener" className="btn btn-primary mt-4 min-h-12 w-full">
                  Open Google Meet
                </a>
                <p className="mt-3 break-all text-sm text-ink-soft">{s.meet_url}</p>
                <p className="mt-3 text-sm text-ink-soft">
                  Join a minute or two early. {config.brand.tutorLabel.replace(/^your /, "Your ")} joins at the start time.
                </p>
              </>
            ) : (
              <p className="mt-3 text-ink-soft">{upcoming ? "Your Meet link is being created — refresh in a minute." : "—"}</p>
            )}
          </section>

          {s.recap || s.practice?.length ? (
            <section className="card p-6" aria-labelledby="recap-title">
              <h2 id="recap-title" className="display text-xl font-extrabold tracking-tight">
                Recap
              </h2>
              {s.recap ? <p className="mt-3 whitespace-pre-line">{s.recap}</p> : null}
              {s.practice?.length && s.practice_token ? (
                <Link href={`/practice/${s.practice_token}`} className="btn btn-ghost mt-4 min-h-11">
                  Practice problems ({s.practice.length})
                </Link>
              ) : null}
            </section>
          ) : null}

          {s.kind === "paid" ? (
            <section className="rounded-3xl bg-cream p-5 text-sm text-ink-soft">
              {s.refunded_at
                ? "Refunded to your card."
                : s.paid_at
                  ? `Paid. Free reschedule or refund until ${start.minus({ hours: config.sessions.freeCancelHours }).toFormat("ccc, LLL d · h:mm a")}.`
                  : "Awaiting payment."}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "held":
      return "Awaiting payment";
    default:
      return status;
  }
}
