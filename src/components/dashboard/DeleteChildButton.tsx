"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteChildButton({ childId, name }: { childId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/account/delete-child", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ childId }),
    });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) {
      setError(j?.error?.message ?? "Couldn't delete right now. Please try again or email us.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-quiet min-h-10 text-sm text-red-deep" onClick={() => setOpen(true)}>
        Delete {name}&apos;s data
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="del-title">
          <div className="card w-full max-w-md bg-paper p-6">
            <h2 id="del-title" className="display text-2xl font-extrabold tracking-tight">
              Delete {name}&apos;s data?
            </h2>
            <p className="mt-3 text-ink-soft">
              This removes {name}&apos;s name and grade, every uploaded note, and the recaps and practice problems from their sessions —
              immediately and permanently. Upcoming sessions stay booked but will show &ldquo;your child&rdquo; instead of a name.
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
              <button type="button" className="btn btn-primary min-h-11" onClick={remove} disabled={busy}>
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
