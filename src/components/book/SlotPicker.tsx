"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { commonZones, useMounted, useSlots } from "./useSlots";

/**
 * Two-week day strip + time grid, all in the parent's time zone.
 * Reused by the booking wizard and the reschedule dialog.
 */
export default function SlotPicker({
  kind,
  tz,
  onTzChange,
  value,
  onChange,
  minDaysAhead = 0,
}: {
  kind: "trial" | "paid";
  tz: string;
  onTzChange?: (tz: string) => void;
  value: string | null;
  onChange: (startsAt: string) => void;
  minDaysAhead?: number;
}) {
  const mounted = useMounted();
  const [weekOffset, setWeekOffset] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  // Reserve roughly the picker's final height so nothing below jumps when it mounts.
  if (!mounted) return <p className="min-h-[24rem] text-ink-soft sm:min-h-[22rem]">Finding open times…</p>;
  return <Picker {...{ kind, tz, onTzChange, value, onChange, minDaysAhead, weekOffset, setWeekOffset, day, setDay }} />;
}

function Picker({
  kind,
  tz,
  onTzChange,
  value,
  onChange,
  minDaysAhead,
  weekOffset,
  setWeekOffset,
  day,
  setDay,
}: {
  kind: "trial" | "paid";
  tz: string;
  onTzChange?: (tz: string) => void;
  value: string | null;
  onChange: (startsAt: string) => void;
  minDaysAhead: number;
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  day: string | null;
  setDay: (d: string) => void;
}) {
  const today = DateTime.now().setZone(tz).startOf("day");
  const from = today.plus({ days: minDaysAhead + weekOffset * 7 });
  const to = from.plus({ days: 13 });
  const { data, error, loading } = useSlots(kind, from.toISODate()!, to.toISODate()!, tz);

  const days = Array.from({ length: 14 }, (_, i) => from.plus({ days: i }));
  const firstOpen = data ? Object.keys(data).sort()[0] : null;
  const activeDay = day && data?.[day] ? day : firstOpen;
  const slots = activeDay && data ? data[activeDay] : [];
  const zones = commonZones.includes(tz) ? commonZones : [tz, ...commonZones];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost min-h-10 px-3"
            onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            aria-label="Earlier dates"
          >
            ←
          </button>
          <span className="display font-bold">
            {from.toFormat("LLL d")} – {to.toFormat("LLL d")}
          </span>
          <button
            type="button"
            className="btn btn-ghost min-h-10 px-3"
            onClick={() => setWeekOffset((w) => Math.min(2, w + 1))}
            disabled={weekOffset >= 2}
            aria-label="Later dates"
          >
            →
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Time zone</span>
          <select className="field min-h-10 w-auto py-1.5 text-sm" value={tz} onChange={(e) => onTzChange?.(e.target.value)} disabled={!onTzChange}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2" role="listbox" aria-label="Pick a day">
        {days.map((d) => {
          const key = d.toISODate()!;
          const n = data?.[key]?.length ?? 0;
          const selected = activeDay === key;
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!n}
              onClick={() => setDay(key)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 text-sm transition-colors ${
                selected
                  ? "border-ink bg-ink text-white"
                  : n
                    ? "border-ink bg-white hover:bg-cream"
                    : "border-line bg-transparent text-ink-faint"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide">{d.toFormat("ccc")}</span>
              <span className="display text-lg font-bold leading-none">{d.toFormat("d")}</span>
              {n ? <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${selected ? "bg-sun" : "bg-red"}`} aria-hidden="true" /> : <span className="mt-0.5 h-1.5" />}
            </button>
          );
        })}
      </div>

      <div className="mt-5 min-h-[7rem]" aria-live="polite">
        {loading ? (
          <p className="text-ink-soft">Finding open times…</p>
        ) : error ? (
          <p className="rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
            {error}
          </p>
        ) : !activeDay ? (
          <p className="text-ink-soft">No open times in this range — try the next two weeks.</p>
        ) : (
          <>
            <p className="mb-3 font-semibold">{DateTime.fromISO(activeDay, { zone: tz }).toFormat("cccc, LLLL d")}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label="Pick a time">
              {slots.map((s) => {
                const selected = value === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onChange(s.startsAt)}
                    className={`relative min-h-12 rounded-xl border-2 border-ink px-2 font-semibold transition-colors ${
                      selected ? "bg-red text-white" : "bg-white hover:bg-cream"
                    }`}
                  >
                    {DateTime.fromISO(s.startsAt).setZone(tz).toFormat("h:mm a")}
                    {s.seatsLeft === 1 ? <span className="absolute -top-2 right-2 rounded-full bg-sun px-1.5 text-[10px] font-bold text-ink">last spot</span> : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
