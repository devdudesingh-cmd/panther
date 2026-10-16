"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Slot } from "@/lib/slots";

export type SlotsByDay = Record<string, Slot[]>;

interface SlotsState {
  key: string;
  data: SlotsByDay | null;
  error: string | null;
}

/** Fetch open slots for a date range in the parent's time zone. */
export function useSlots(kind: "trial" | "paid", fromDate: string, toDate: string, tz: string) {
  const key = `${kind}|${fromDate}|${toDate}|${tz}`;
  const [state, setState] = useState<SlotsState>({ key: "", data: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    const q = new URLSearchParams({ kind, from: fromDate, to: toDate, tz });
    fetch(`/api/slots?${q}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error?.message ?? "Couldn't load times.");
        return r.json() as Promise<{ slots: SlotsByDay }>;
      })
      .then((j) => setState({ key, data: j.slots, error: null }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ key, data: null, error: e.message });
      });
    return () => ctrl.abort();
  }, [key, kind, fromDate, toDate, tz]);

  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !current };
}

const noop = () => () => {};

/** True after hydration. Lets time-dependent UI render on the client only. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

let detected: string | null = null;
function detectOnce(): string {
  if (detected) return detected;
  try {
    detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    detected = "America/Los_Angeles";
  }
  return detected;
}

/** The visitor's IANA time zone; "America/Los_Angeles" during SSR. */
export function useDetectedTimeZone(): string {
  return useSyncExternalStore(noop, detectOnce, () => "America/Los_Angeles");
}

export const commonZones = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
];
