import { DateTime } from "luxon";

/** "Tue, Oct 21 · 4:00 PM PDT" in the given zone. */
export function formatWhen(iso: string | Date, zone: string): string {
  const dt = (typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(zone);
  return `${dt.toFormat("ccc, LLL d")} · ${dt.toFormat("h:mm a ZZZZ")}`;
}

/** "4:00 PM" */
export function formatTime(iso: string | Date, zone: string): string {
  const dt = (typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(zone);
  return dt.toFormat("h:mm a");
}

/** "Tuesday, October 21" */
export function formatDay(iso: string | Date, zone: string): string {
  const dt = (typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(zone);
  return dt.toFormat("cccc, LLLL d");
}

export function isValidZone(zone: string | undefined | null): zone is string {
  return !!zone && DateTime.now().setZone(zone).isValid;
}

export function hoursUntil(iso: string, now = new Date()): number {
  return (Date.parse(iso) - now.getTime()) / 3_600_000;
}
