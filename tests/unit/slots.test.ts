import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { availableSlots, candidateStartsForDay, isWithinBusinessHours, seatsFree, validateStart } from "@/lib/slots";
import { config } from "@/config";

const LA = config.businessHours.timeZone;

describe("slot engine", () => {
  it("generates candidate starts on 10-minute marks inside LA business hours", () => {
    const monday = DateTime.fromISO("2026-10-19T00:00", { zone: LA }); // a Monday
    const starts = candidateStartsForDay(monday, 40).map((ms) => DateTime.fromMillis(ms, { zone: LA }).toFormat("HH:mm"));
    expect(starts[0]).toBe("15:00");
    expect(starts.at(-1)).toBe("19:20"); // 19:20 + 40 = 20:00 (closing)
    expect(starts).toContain("16:10");
    expect(starts).not.toContain("19:30");
  });

  it("weekend hours differ from weekday hours", () => {
    const saturday = DateTime.fromISO("2026-10-24T00:00", { zone: LA });
    const starts = candidateStartsForDay(saturday, 25).map((ms) => DateTime.fromMillis(ms, { zone: LA }).toFormat("HH:mm"));
    expect(starts[0]).toBe("09:00");
    expect(starts.at(-1)).toBe("12:30");
  });

  it("handles the DST change without drifting (Nov 1 2026, clocks fall back in LA)", () => {
    const sunday = DateTime.fromISO("2026-11-01T00:00", { zone: LA });
    const starts = candidateStartsForDay(sunday, 25).map((ms) => DateTime.fromMillis(ms, { zone: LA }));
    expect(starts[0].toFormat("HH:mm")).toBe("09:00");
    expect(starts[0].offset).toBe(-480); // PST after fall-back
    const mondayBefore = DateTime.fromISO("2026-10-26T00:00", { zone: LA });
    const before = candidateStartsForDay(mondayBefore, 40).map((ms) => DateTime.fromMillis(ms, { zone: LA }));
    expect(before[0].offset).toBe(-420); // still PDT
    expect(before[0].toUTC().toFormat("HH:mm")).toBe("22:00");
    const mondayAfter = DateTime.fromISO("2026-11-02T00:00", { zone: LA });
    const after = candidateStartsForDay(mondayAfter, 40).map((ms) => DateTime.fromMillis(ms, { zone: LA }));
    expect(after[0].toUTC().toFormat("HH:mm")).toBe("23:00"); // same wall-clock 3pm, different UTC
  });

  it("isWithinBusinessHours agrees with the candidate list", () => {
    expect(isWithinBusinessHours(DateTime.fromISO("2026-10-20T16:00", { zone: LA }).toJSDate(), "paid")).toBe(true);
    expect(isWithinBusinessHours(DateTime.fromISO("2026-10-20T19:30", { zone: LA }).toJSDate(), "paid")).toBe(false); // would end 20:10
    expect(isWithinBusinessHours(DateTime.fromISO("2026-10-20T19:30", { zone: LA }).toJSDate(), "trial")).toBe(true); // 25 min fits
    expect(isWithinBusinessHours(DateTime.fromISO("2026-10-20T16:05", { zone: LA }).toJSDate(), "paid")).toBe(false); // not on a 10-min mark
  });

  it("seatsFree mirrors the DB rule: seat taken when [start, end+buffer) ranges overlap", () => {
    const t0 = Date.parse("2026-10-20T23:00:00Z");
    const busy = [{ starts_at: new Date(t0).toISOString(), block_until: new Date(t0 + 50 * 60_000).toISOString(), seat: 1 }];
    expect(seatsFree(t0, 40, busy, 3, 10)).toBe(2);
    expect(seatsFree(t0 + 45 * 60_000, 40, busy, 3, 10)).toBe(2); // inside buffer
    expect(seatsFree(t0 + 50 * 60_000, 40, busy, 3, 10)).toBe(3); // after buffer
    expect(seatsFree(t0 - 50 * 60_000, 40, busy, 3, 10)).toBe(3); // ends exactly at buffer start
    expect(seatsFree(t0 - 45 * 60_000, 40, busy, 3, 10)).toBe(2); // would leave a 5-min gap
    expect(seatsFree(t0, 40, busy, 1, 10)).toBe(0);
  });

  it("availableSlots groups by the parent's day, respects lead time and blocks", () => {
    const now = DateTime.fromISO("2026-10-19T12:00", { zone: LA }).toJSDate(); // Monday noon LA
    const open = availableSlots({
      kind: "paid",
      fromDate: "2026-10-19",
      toDate: "2026-10-20",
      parentTz: "America/New_York",
      busy: [],
      blocked: [{ starts_at: "2026-10-19T22:00:00Z", ends_at: "2026-10-19T23:00:00Z" }], // 3–4pm LA Monday blocked
      now,
    });
    expect(Object.keys(open)).toEqual(["2026-10-19", "2026-10-20"]);
    const mondayTimesET = open["2026-10-19"].map((s) => DateTime.fromISO(s.startsAt).setZone("America/New_York").toFormat("HH:mm"));
    expect(mondayTimesET[0]).toBe("19:00"); // 4pm LA = 7pm ET, after the block
    expect(mondayTimesET).not.toContain("18:00");
    expect(open["2026-10-19"].every((s) => s.seatsLeft === config.sessions.maxSimultaneous)).toBe(true);
  });

  it("availableSlots returns nothing when paused or when trials are off", () => {
    expect(availableSlots({ kind: "paid", fromDate: "2026-10-19", toDate: "2026-10-25", parentTz: LA, busy: [], blocked: [], bookingsPaused: true })).toEqual({});
  });

  it("validateStart gives specific reasons", () => {
    const now = DateTime.fromISO("2026-10-19T12:00", { zone: LA }).toJSDate();
    expect(validateStart(new Date("2026-10-19T10:00:00Z"), "paid", now)).toBe("SLOT_PAST");
    expect(validateStart(DateTime.fromISO("2026-10-19T12:30", { zone: LA }).toJSDate(), "paid", now)).toBe("SLOT_TOO_SOON");
    expect(validateStart(DateTime.fromISO("2026-12-19T16:00", { zone: LA }).toJSDate(), "paid", now)).toBe("SLOT_TOO_FAR");
    expect(validateStart(DateTime.fromISO("2026-10-20T10:00", { zone: LA }).toJSDate(), "paid", now)).toBe("SLOT_OUTSIDE_HOURS");
    expect(validateStart(DateTime.fromISO("2026-10-20T16:00", { zone: LA }).toJSDate(), "paid", now)).toBeNull();
    expect(validateStart(new Date("garbage"), "paid", now)).toBe("INVALID");
  });
});
