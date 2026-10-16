"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import Panther from "@/components/mascot/Panther";
import { config } from "@/config";

interface Status {
  id: string;
  kind: "trial" | "paid";
  status: "held" | "confirmed" | "completed" | "cancelled" | "expired";
  startsAt: string;
  meetUrl: string | null;
  parentTz: string;
  cancelReason: string | null;
  fulfilled: boolean;
}

export default function DoneClient() {
  const params = useSearchParams();
  const id = params.get("session");
  const [s, setS] = useState<Status | null>(null);
  const [tries, setTries] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const r = await fetch(`/api/bookings/${id}`, { cache: "no-store" });
        if (r.status === 401) {
          setErr("Please sign in to see this booking.");
          return;
        }
        if (!r.ok) throw new Error();
        const j = (await r.json()) as Status;
        if (cancelled) return;
        setS(j);
        const settled = (j.status === "confirmed" && j.fulfilled) || j.status === "cancelled" || j.status === "completed";
        if (!settled && tries < 60) {
          timer = window.setTimeout(() => setTries((t) => t + 1), 2000);
        }
      } catch {
        if (!cancelled) setErr("We couldn't load your booking. Your dashboard has the latest status.");
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, tries]);

  if (!id) {
    return (
      <p className="text-ink-soft">
        Missing booking reference. <Link href="/dashboard" className="font-semibold text-red underline">Go to your dashboard</Link>.
      </p>
    );
  }

  const when = s ? DateTime.fromISO(s.startsAt).setZone(s.parentTz) : null;
  const confirmed = s?.status === "confirmed" || s?.status === "completed";
  const failed = s?.status === "cancelled" || s?.status === "expired";

  return (
    <div className="mx-auto grid max-w-3xl items-center gap-10 md:grid-cols-[1fr_auto]">
      <div>
        <p className="eyebrow">{confirmed ? "You're booked" : failed ? "Hmm" : "Almost there"}</p>
        <h1 className="text-display-md mt-3">
          {confirmed ? "See you on the Meet!" : failed ? "That didn't go through." : "Confirming with Stripe…"}
        </h1>

        {err ? (
          <p className="mt-6 rounded-xl bg-blush px-4 py-3 font-semibold text-red-deep" role="alert">
            {err}
          </p>
        ) : null}

        {!s && !err ? <p className="mt-6 text-lg text-ink-soft">One moment while we check your payment.</p> : null}

        {s && !confirmed && !failed ? (
          <p className="mt-6 text-lg text-ink-soft" aria-live="polite">
            Payment received{s.status === "held" ? " — finishing up your Meet link and calendar invite" : ""}. This usually takes a few seconds.
          </p>
        ) : null}

        {confirmed && when ? (
          <div className="mt-6 space-y-5" aria-live="polite">
            <div className="rounded-2xl bg-cream p-5">
              <p className="display text-xl font-extrabold">
                {when.toFormat("cccc, LLLL d")} · {when.toFormat("h:mm a ZZZZ")}
              </p>
              {s.meetUrl ? (
                <p className="mt-2">
                  Google Meet:{" "}
                  <a href={s.meetUrl} className="font-semibold text-red underline-offset-4 hover:underline">
                    {s.meetUrl}
                  </a>
                </p>
              ) : (
                <p className="mt-2 text-ink-soft">Your Meet link is on its way — it&apos;ll be in your email and dashboard in a moment.</p>
              )}
            </div>
            <p className="text-ink-soft">
              A confirmation email and calendar invite are heading to your inbox. {config.brand.tutorLabel.replace(/^your /, "Your ")} will join the Meet
              at the start time.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/dashboard/s/${s.id}`} className="btn btn-primary min-h-12">
                Upload homework or notes
              </Link>
              <Link href="/dashboard" className="btn btn-ghost min-h-12">
                Go to dashboard
              </Link>
            </div>
          </div>
        ) : null}

        {failed ? (
          <div className="mt-6 space-y-4">
            <p className="text-lg text-ink-soft">
              {s?.cancelReason === "trial_already_used"
                ? "It looks like your family has already used its free trial, so we couldn't confirm a second one. Nothing was charged."
                : s?.status === "expired"
                  ? "The time was released because checkout wasn't completed in time. If you were charged, you'll be refunded automatically."
                  : "This booking was cancelled. If a payment went through, it's being refunded automatically."}
            </p>
            <Link href={s?.cancelReason === "trial_already_used" ? "/book?kind=paid" : "/book"} className="btn btn-primary min-h-12">
              Pick another time
            </Link>
          </div>
        ) : null}
      </div>
      <Panther mood={confirmed ? "cheer" : "idle"} className="mx-auto w-48 md:w-56" followCursor={false} />
    </div>
  );
}
