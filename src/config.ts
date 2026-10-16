/**
 * Panther — the one config file.
 *
 * Everything a non-developer might want to change lives here: prices, session
 * lengths, business hours, capacity, the free-trial switch, brand colors and
 * the support address. Secrets never go here — they live in env vars
 * (see .env.example).
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday … 6 = Saturday

export interface HoursWindow {
  /** "HH:mm" in the business time zone */
  start: string;
  /** "HH:mm" in the business time zone */
  end: string;
}

export const config = {
  brand: {
    name: "Panther",
    tagline: "Live math help for kids in grades 2–4.",
    /** Who parents and kids meet in the Google Meet. Kept generic on purpose; see PLAN.md §0 item 8. */
    tutorLabel: "your Panther tutor",
    supportEmail: "hello@panther.example",
    colors: {
      red: "#D6111E",
      redDeep: "#A80D17",
      paper: "#FFF8F2",
      ink: "#1B0E0E",
      blush: "#FFE3DC",
      cream: "#FFEFE4",
    },
  },

  pricing: {
    currency: "usd",
    /** Price of one paid session, in cents. */
    paidSessionCents: 1900,
  },

  sessions: {
    /** Free trial length, in minutes (what parents are promised). */
    trialMinutes: 25,
    /** Paid session length, in minutes. */
    paidMinutes: 40,
    /** Gap enforced between any two sessions on the same seat. */
    bufferMinutes: 10,
    /** How many sessions may run at the same time. */
    maxSimultaneous: 3,
    /** How long a slot is held while a parent checks out. */
    holdMinutes: 10,
    /** Switch the free trial on or off site-wide. */
    freeTrialEnabled: true,
    /** Cancel or reschedule for free (and get an automatic refund) up to this many hours before. */
    freeCancelHours: 24,
    /** How far ahead a parent may book. */
    maxDaysAhead: 30,
    /**
     * Earliest bookable start, in minutes from now. Must stay well above 10 so
     * the Recall bot is always a guaranteed "scheduled" bot (join_at > 10 min out).
     */
    minLeadMinutes: 90,
    /** The tutor joins the Meet this many minutes before the session starts. */
    tutorJoinLeadMinutes: 2,
    /** Reminder emails, in hours before the session. */
    reminderHours: [24, 1] as const,
    /** Grades offered. */
    grades: [2, 3, 4] as const,
    /** Topics a parent can pick for their kid. "Something else" is always offered too. */
    topics: [
      "Addition & subtraction",
      "Multiplication tables",
      "Division",
      "Fractions",
      "Place value",
      "Word problems",
      "Telling time & money",
      "Measurement",
      "Homework help",
    ] as const,
  },

  businessHours: {
    timeZone: "America/Los_Angeles",
    /** Open windows per weekday, in the business time zone. Missing days are closed. */
    windows: {
      0: [{ start: "09:00", end: "13:00" }],
      1: [{ start: "15:00", end: "20:00" }],
      2: [{ start: "15:00", end: "20:00" }],
      3: [{ start: "15:00", end: "20:00" }],
      4: [{ start: "15:00", end: "20:00" }],
      5: [{ start: "15:00", end: "20:00" }],
      6: [{ start: "09:00", end: "13:00" }],
    } as Partial<Record<Weekday, HoursWindow[]>>,
    /** Slots start on these minute marks. */
    slotStepMinutes: 10,
  },

  legal: {
    /** Bump this whenever the privacy policy or consent wording changes. Stored with every consent. */
    policyVersion: "2026-10-16",
    minParentAge: 18,
  },
} as const;

export type Config = typeof config;
export type Grade = (typeof config.sessions.grades)[number];
export type SessionKind = "trial" | "paid";

/** Length in minutes for a session kind. */
export function sessionMinutes(kind: SessionKind): number {
  return kind === "trial" ? config.sessions.trialMinutes : config.sessions.paidMinutes;
}

/** Price in cents for a session kind. */
export function sessionPriceCents(kind: SessionKind): number {
  return kind === "trial" ? 0 : config.pricing.paidSessionCents;
}

/** "$19" style formatting for prices in config. */
export function formatPrice(cents: number, currency = config.pricing.currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
