"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/config";

export default function CancelButton({ sessionId, refundable, tooLate }: { sessionId: string; refundable: boolean; tooLate: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function cancel() {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/bookings/${sessionId}/cancel`, { method: "POST" });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) {
      setError(j?.error?.message ?? "Couldn't cancel. Please try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-quiet min-h-11 text-[15px]" onClick={() => setOpen(true)}>
        Cancel
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="card w-full max-w-md bg-paper p-6">
            <h2 id="cancel-title" className="display text-2xl font-extrabold tracking-tight">
              Cancel this session?
            </h2>
            <p className="mt-3 text-ink-soft">
              {refundable
                ? "You're more than 24 hours out, so your payment will be refunded automatically to the same card."
                : tooLate
                  ? `This is inside the ${config.sessions.freeCancelHours}-hour window, so it isn't refundable. If something unexpected came up, email us and we'll do our best.`
                  : "The time will be freed up for another family."}
            </p>
            {error ? (
              <p className="mt-3 rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost min-h-11" onClick={() => setOpen(false)} disabled={busy}>
                Keep it
              </button>
              <button type="button" className="btn btn-primary min-h-11" onClick={cancel} disabled={busy}>
                {busy ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
