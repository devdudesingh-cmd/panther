import { DateTime, Interval } from "luxon";
import { config, type SessionKind, type Weekday, sessionMinutes } from "@/config";

/**
 * Slot engine. Pure functions — no I/O — so the rules are easy to test.
 *
 * Business hours are defined in config in America/Los_Angeles. Candidate
 * starts are generated in that zone (so DST is handled by luxon), then checked
 * against what's already booked using the same seat logic as book_slot().
 */

export interface Busy {
  /** ISO start */
  starts_at: string;
  /** ISO end + buffer (block_until) */
  block_until: string;
  seat: number;
}

export interface BlockedRange {
  starts_at: string;
  ends_at: string;
}

export interface Slot {
  /** ISO 8601, UTC */
  startsAt: string;
  endsAt: string;
  /** How many seats remain (1..max). Shown as "last spot" when 1. */
  seatsLeft: number;
}

export interface SlotQuery {
  kind: SessionKind;
  /** First day to show (inclusive), as an ISO date in the parent's zone */
  fromDate: string;
  /** Last day to show (inclusive), as an ISO date in the parent's zone */
  toDate: string;
  /** Parent's IANA time zone */
  parentTz: string;
  busy: Busy[];
  blocked: BlockedRange[];
  now?: Date;
  bookingsPaused?: boolean;
}

const BIZ = config.businessHours;

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h, m };
}

/** All candidate start times (in UTC millis) on a given LA calendar day for a session length. */
export function candidateStartsForDay(dayLA: DateTime, minutes: number): number[] {
  const weekday = (dayLA.weekday % 7) as Weekday; // luxon: 1=Mon..7=Sun → 0=Sun..6=Sat
  const windows = BIZ.windows[weekday] ?? [];
  const out: number[] = [];
  for (const w of windows) {
    const s = parseHm(w.start);
    const e = parseHm(w.end);
    let t = dayLA.set({ hour: s.h, minute: s.m, second: 0, millisecond: 0 });
    const end = dayLA.set({ hour: e.h, minute: e.m, second: 0, millisecond: 0 });
    while (t.plus({ minutes }) <= end) {
      out.push(t.toMillis());
      t = t.plus({ minutes: BIZ.slotStepMinutes });
    }
  }
  return out;
}

/** True when a start time falls inside configured business hours (LA) for the session length. */
export function isWithinBusinessHours(startsAt: Date, kind: SessionKind): boolean {
  const minutes = sessionMinutes(kind);
  const la = DateTime.fromJSDate(startsAt, { zone: BIZ.timeZone });
  return candidateStartsForDay(la.startOf("day"), minutes).includes(la.toMillis());
}

/** Seats still free for a candidate [start, start + minutes + buffer) given current bookings. */
export function seatsFree(startMs: number, minutes: number, busy: Busy[], maxSeats: number, bufferMinutes: number): number {
  const candEnd = startMs + (minutes + bufferMinutes) * 60_000;
  const taken = new Set<number>();
  for (const b of busy) {
    const bs = Date.parse(b.starts_at);
    const be = Date.parse(b.block_until);
    if (bs < candEnd && startMs < be) taken.add(b.seat);
  }
  let free = 0;
  for (let seat = 1; seat <= maxSeats; seat++) if (!taken.has(seat)) free++;
  return free;
}

function isBlocked(startMs: number, endMs: number, blocked: BlockedRange[]): boolean {
  return blocked.some((b) => Date.parse(b.starts_at) < endMs && startMs < Date.parse(b.ends_at));
}

/** Earliest allowed start, given the configured lead time. */
export function earliestStart(now: Date): Date {
  return new Date(now.getTime() + config.sessions.minLeadMinutes * 60_000);
}

/** Latest allowed start. */
export function latestStart(now: Date): Date {
  return new Date(now.getTime() + config.sessions.maxDaysAhead * 86_400_000);
}

/**
 * Open slots grouped by the parent's local calendar day.
 * Returns a map of "YYYY-MM-DD" (parent zone) → slots, only days with slots.
 */
export function availableSlots(q: SlotQuery): Record<string, Slot[]> {
  if (q.bookingsPaused) return {};
  if (q.kind === "trial" && !config.sessions.freeTrialEnabled) return {};

  const now = q.now ?? new Date();
  const minutes = sessionMinutes(q.kind);
  const minStart = earliestStart(now).getTime();
  const maxStart = latestStart(now).getTime();

  const from = DateTime.fromISO(q.fromDate, { zone: q.parentTz }).startOf("day");
  const to = DateTime.fromISO(q.toDate, { zone: q.parentTz }).endOf("day");
  if (!from.isValid || !to.isValid) return {};

  // The parent's day range may straddle LA days on either side; scan a day extra each way.
  const laFrom = from.setZone(BIZ.timeZone).startOf("day").minus({ days: 1 });
  const laTo = to.setZone(BIZ.timeZone).startOf("day").plus({ days: 1 });
  const range = Interval.fromDateTimes(from, to);

  const result: Record<string, Slot[]> = {};
  for (let day = laFrom; day <= laTo; day = day.plus({ days: 1 })) {
    for (const startMs of candidateStartsForDay(day, minutes)) {
      if (startMs < minStart || startMs > maxStart) continue;
      const startDt = DateTime.fromMillis(startMs, { zone: q.parentTz });
      if (!range.contains(startDt)) continue;
      const endMs = startMs + minutes * 60_000;
      if (isBlocked(startMs, endMs, q.blocked)) continue;
      const free = seatsFree(startMs, minutes, q.busy, config.sessions.maxSimultaneous, config.sessions.bufferMinutes);
      if (free <= 0) continue;
      const key = startDt.toISODate()!;
      (result[key] ??= []).push({
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString(),
        seatsLeft: free,
      });
    }
  }
  return result;
}

/** Validate a specific requested start before trying to hold it (fast, friendly errors). */
export function validateStart(startsAt: Date, kind: SessionKind, now = new Date()): import("./errors").BookingErrorCode | null {
  if (Number.isNaN(startsAt.getTime())) return "INVALID";
  if (startsAt.getTime() <= now.getTime()) return "SLOT_PAST";
  if (startsAt.getTime() < earliestStart(now).getTime()) return "SLOT_TOO_SOON";
  if (startsAt.getTime() > latestStart(now).getTime()) return "SLOT_TOO_FAR";
  if (!isWithinBusinessHours(startsAt, kind)) return "SLOT_OUTSIDE_HOURS";
  return null;
}
