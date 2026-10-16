"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/config";
import SlotPicker from "@/components/book/SlotPicker";

export default function RescheduleDialog({ sessionId, kind, tz, disabled }: { sessionId: string; kind: "trial" | "paid"; tz: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    if (!startsAt) return;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/bookings/${sessionId}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startsAt }),
    });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) {
      setError(j?.error?.message ?? "Couldn't move the session. Please try another time.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost min-h-11 text-[15px]"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? `Rescheduling closes ${config.sessions.freeCancelHours} hours before the session` : undefined}
      >
        Reschedule
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="resched-title">
          <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto bg-paper p-5 sm:p-7" data-lenis-prevent>
            <div className="flex items-start justify-between gap-4">
              <h2 id="resched-title" className="display text-2xl font-extrabold tracking-tight">
                Pick a new time
              </h2>
              <button type="button" className="btn btn-quiet min-h-10 px-3" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-soft">Free, as long as it&apos;s more than {config.sessions.freeCancelHours} hours away. Your Meet link stays the same.</p>
            <div className="mt-5">
              <SlotPicker kind={kind} tz={tz} value={startsAt} onChange={setStartsAt} />
            </div>
            {error ? (
              <p className="mt-3 rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost min-h-11" onClick={() => setOpen(false)} disabled={busy}>
                Never mind
              </button>
              <button type="button" className="btn btn-primary min-h-11" onClick={save} disabled={!startsAt || busy}>
                {busy ? "Moving…" : "Move session"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
