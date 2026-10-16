"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Small client controls for the admin page. Each one calls an /api/admin route and refreshes. */

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(url: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="mt-2 text-sm font-semibold text-red-deep" role="alert">
      {error}
    </p>
  ) : null;
}

export function PauseToggle({ paused, message }: { paused: boolean; message: string | null }) {
  const { run, busy, error } = useAction();
  const [msg, setMsg] = useState(message ?? "");
  return (
    <div className={`rounded-3xl border-2 border-ink p-5 ${paused ? "bg-blush" : "bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="display text-lg font-extrabold">Bookings are {paused ? "paused" : "open"}</p>
          <p className="text-sm text-ink-soft">{paused ? "Parents see no slots until you resume." : "Flip this to block out everything at once."}</p>
        </div>
        <button
          type="button"
          className={`btn min-h-11 ${paused ? "btn-primary" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => run("/api/admin/settings", { method: "POST", body: JSON.stringify({ bookingsPaused: !paused, pausedMessage: msg || null }) })}
          aria-pressed={paused}
        >
          {busy ? "Saving…" : paused ? "Resume bookings" : "Pause bookings"}
        </button>
      </div>
      <input className="field mt-3 text-sm" placeholder="Optional message shown to parents while paused" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <ErrorLine error={error} />
    </div>
  );
}

export function ResolveFlagButton({ id }: { id: string }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <button type="button" className="btn btn-ghost min-h-10 text-sm" disabled={busy} onClick={() => run(`/api/admin/flags/${id}`, { method: "POST" })}>
        {busy ? "…" : "Mark resolved"}
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

export function AdminCancelButton({ sessionId }: { sessionId: string }) {
  const { run, busy, error } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="text-right">
      {confirm ? (
        <span className="inline-flex gap-1">
          <button type="button" className="btn btn-primary min-h-9 px-3 text-xs" disabled={busy} onClick={() => run(`/api/admin/sessions/${sessionId}/cancel`, { method: "POST" })}>
            {busy ? "…" : "Cancel + refund"}
          </button>
          <button type="button" className="btn btn-quiet min-h-9 px-3 text-xs" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button type="button" className="btn btn-quiet min-h-9 px-3 text-xs" onClick={() => setConfirm(true)}>
          Cancel
        </button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

export function BlockoutForm() {
  const { run, busy, error } = useAction();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        // datetime-local has no zone; the server interprets it in the business time zone.
        const ok = await run("/api/admin/blocks", { method: "POST", body: JSON.stringify({ startLocal: start, endLocal: end, reason: reason || null }) });
        if (ok) {
          setStart("");
          setEnd("");
          setReason("");
        }
      }}
    >
      <label className="text-sm font-semibold">
        From (LA time)
        <input type="datetime-local" className="field mt-1 text-sm" value={start} onChange={(e) => setStart(e.target.value)} required />
      </label>
      <label className="text-sm font-semibold">
        To (LA time)
        <input type="datetime-local" className="field mt-1 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} required />
      </label>
      <label className="text-sm font-semibold">
        Reason
        <input className="field mt-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Holiday, staff meeting…" />
      </label>
      <button type="submit" className="btn btn-primary min-h-12" disabled={busy}>
        {busy ? "Adding…" : "Block time"}
      </button>
      {error ? (
        <p className="text-sm font-semibold text-red-deep sm:col-span-4" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteBlockButton({ id }: { id: string }) {
  const { run, busy } = useAction();
  return (
    <button type="button" className="btn btn-quiet min-h-9 px-3 text-xs" disabled={busy} onClick={() => run(`/api/admin/blocks?id=${id}`, { method: "DELETE" })} aria-label="Remove block-out">
      {busy ? "…" : "Remove"}
    </button>
  );
}
