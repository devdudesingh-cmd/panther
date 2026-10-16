export type BookingErrorCode =
  | "BOOKINGS_PAUSED"
  | "SLOT_PAST"
  | "SLOT_TOO_SOON"
  | "SLOT_OUTSIDE_HOURS"
  | "SLOT_TOO_FAR"
  | "SLOT_BLOCKED"
  | "SLOT_FULL"
  | "TRIAL_DISABLED"
  | "TRIAL_USED"
  | "PARENT_OVERLAP"
  | "NOT_ACTIVE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "TOO_LATE"
  | "INVALID";

const MESSAGES: Record<BookingErrorCode, string> = {
  BOOKINGS_PAUSED: "Booking is paused right now. Please check back soon.",
  SLOT_PAST: "That time has already passed.",
  SLOT_TOO_SOON: "Please pick a time at least a couple of hours from now.",
  SLOT_OUTSIDE_HOURS: "That time is outside our tutoring hours.",
  SLOT_TOO_FAR: "That's a bit too far ahead — please pick a date within the next month.",
  SLOT_BLOCKED: "That time isn't available.",
  SLOT_FULL: "That time was just taken. Please pick another.",
  TRIAL_DISABLED: "Free trials aren't available right now.",
  TRIAL_USED: "Looks like your family has already used its free trial. You can book a regular session instead.",
  PARENT_OVERLAP: "You already have a session at that time.",
  NOT_ACTIVE: "This session can't be changed anymore.",
  NOT_FOUND: "We couldn't find that session.",
  FORBIDDEN: "You don't have access to that.",
  TOO_LATE: "Changes aren't possible this close to the session.",
  INVALID: "Something in the form doesn't look right.",
};

export class BookingError extends Error {
  readonly code: BookingErrorCode;
  readonly status: number;
  constructor(code: BookingErrorCode, status?: number) {
    super(MESSAGES[code]);
    this.name = "BookingError";
    this.code = code;
    this.status = status ?? (code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "SLOT_FULL" ? 409 : 400);
  }
}

/** Turn a Postgres error raised by book_slot()/move_session() into a BookingError. */
export function bookingErrorFromPg(e: unknown): BookingError | null {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const m = msg.match(/\b(BOOKINGS_PAUSED|SLOT_PAST|SLOT_BLOCKED|TRIAL_USED|PARENT_OVERLAP|SLOT_FULL|NOT_ACTIVE)\b/);
  return m ? new BookingError(m[1] as BookingErrorCode) : null;
}
