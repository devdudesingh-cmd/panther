import type { AdminClient } from "@/lib/supabase/admin";
import type {
  AppSettingsRow,
  ChildRow,
  ConsentRow,
  ParentRow,
  PaymentFailureRow,
  SessionKind,
  SessionRow,
  TrialClaimRow,
} from "@/lib/db/types";
import type { BlockedRange } from "@/lib/slots";
import { BookingError, bookingErrorFromPg } from "@/lib/errors";

/**
 * The booking service's view of the database. Small on purpose: it's
 * implemented over supabase-js for production and over PGlite in tests, so
 * the orchestration logic (confirm, fulfill, cancel, reminders) runs against
 * real SQL in CI with the external providers faked.
 */
export interface BookSlotArgs {
  parentId: string;
  childId: string | null;
  kind: SessionKind;
  startsAt: string;
  minutes: number;
  bufferMinutes: number;
  maxSeats: number;
  holdMinutes: number;
  topic: string | null;
  priceCents: number;
  parentTimezone: string;
}

export interface BookingRepo {
  getParent(id: string): Promise<ParentRow | null>;
  updateParent(id: string, patch: Partial<ParentRow>): Promise<void>;
  getChild(id: string, parentId: string): Promise<ChildRow | null>;
  createChild(parentId: string, firstName: string, grade: number): Promise<ChildRow>;
  insertConsent(c: Omit<ConsentRow, "id" | "consented_at">): Promise<void>;

  getSession(id: string): Promise<SessionRow | null>;
  getSessionByCheckout(checkoutId: string): Promise<SessionRow | null>;
  updateSession(id: string, patch: Partial<SessionRow>): Promise<SessionRow>;
  bookSlot(args: BookSlotArgs): Promise<SessionRow>;
  moveSession(id: string, startsAt: string, bufferMinutes: number, maxSeats: number): Promise<SessionRow>;
  /** Re-hold an expired session (late payment). Throws SLOT_FULL when the time is gone. */
  reviveHold(id: string, bufferMinutes: number, maxSeats: number, holdMinutes: number): Promise<SessionRow>;
  expireStaleHolds(): Promise<number>;
  /** held + confirmed sessions whose [starts_at, block_until) touches [from, to) */
  listActive(fromIso: string, toIso: string): Promise<SessionRow[]>;
  listConfirmedStartingBetween(fromIso: string, toIso: string): Promise<SessionRow[]>;
  /** confirmed, not yet fulfilled, in the future */
  listUnfulfilled(): Promise<SessionRow[]>;
  markCompleted(nowIso: string): Promise<number>;

  listBlocked(fromIso: string, toIso: string): Promise<BlockedRange[]>;
  getSettings(): Promise<AppSettingsRow>;

  findTrialClaim(q: { emailHash: string; cardFingerprint?: string | null; phoneHash?: string | null }): Promise<TrialClaimRow | null>;
  insertTrialClaim(row: Omit<TrialClaimRow, "id" | "created_at">): Promise<"ok" | "conflict">;

  /** true if this event id has not been seen before (and is now recorded) */
  claimStripeEvent(eventId: string, type: string): Promise<boolean>;
  insertPaymentFailure(row: Omit<PaymentFailureRow, "id" | "created_at">): Promise<void>;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
}

export function supabaseRepo(db: AdminClient): BookingRepo {
  return {
    async getParent(id) {
      const { data } = await db.from("parents").select("*").eq("id", id).maybeSingle();
      return data;
    },
    async updateParent(id, patch) {
      const { error } = await db.from("parents").update(patch).eq("id", id);
      if (error) throw new Error(`updateParent: ${error.message}`);
    },
    async getChild(id, parentId) {
      const { data } = await db.from("children").select("*").eq("id", id).eq("parent_id", parentId).maybeSingle();
      return data;
    },
    async createChild(parentId, firstName, grade) {
      return unwrap(
        await db.from("children").insert({ parent_id: parentId, first_name: firstName, grade }).select().single(),
        "createChild",
      );
    },
    async insertConsent(c) {
      const { error } = await db.from("consents").insert(c);
      if (error) throw new Error(`insertConsent: ${error.message}`);
    },

    async getSession(id) {
      const { data } = await db.from("sessions").select("*").eq("id", id).maybeSingle();
      return data;
    },
    async getSessionByCheckout(checkoutId) {
      const { data } = await db.from("sessions").select("*").eq("stripe_checkout_id", checkoutId).maybeSingle();
      return data;
    },
    async updateSession(id, patch) {
      return unwrap(await db.from("sessions").update(patch).eq("id", id).select().single(), "updateSession");
    },
    async bookSlot(a) {
      const { data, error } = await db.rpc("book_slot", {
        p_parent_id: a.parentId,
        p_child_id: a.childId,
        p_kind: a.kind,
        p_starts_at: a.startsAt,
        p_minutes: a.minutes,
        p_buffer_minutes: a.bufferMinutes,
        p_max_seats: a.maxSeats,
        p_hold_minutes: a.holdMinutes,
        p_topic: a.topic,
        p_price_cents: a.priceCents,
        p_parent_timezone: a.parentTimezone,
      });
      if (error) throw bookingErrorFromPg(error) ?? new Error(`book_slot: ${error.message}`);
      if (!data) throw new BookingError("SLOT_FULL");
      return data as SessionRow;
    },
    async moveSession(id, startsAt, bufferMinutes, maxSeats) {
      const { data, error } = await db.rpc("move_session", {
        p_session_id: id,
        p_starts_at: startsAt,
        p_buffer_minutes: bufferMinutes,
        p_max_seats: maxSeats,
      });
      if (error) throw bookingErrorFromPg(error) ?? new Error(`move_session: ${error.message}`);
      if (!data) throw new BookingError("NOT_FOUND");
      return data as SessionRow;
    },
    async reviveHold(id, bufferMinutes, maxSeats, holdMinutes) {
      const { data, error } = await db.rpc("revive_hold", {
        p_session_id: id,
        p_buffer_minutes: bufferMinutes,
        p_max_seats: maxSeats,
        p_hold_minutes: holdMinutes,
      });
      if (error) throw bookingErrorFromPg(error) ?? new Error(`revive_hold: ${error.message}`);
      if (!data) throw new BookingError("NOT_FOUND");
      return data as SessionRow;
    },
    async expireStaleHolds() {
      const { data, error } = await db.rpc("expire_stale_holds", {});
      if (error) throw new Error(`expire_stale_holds: ${error.message}`);
      return data ?? 0;
    },
    async listActive(fromIso, toIso) {
      const { data, error } = await db
        .from("sessions")
        .select("*")
        .in("status", ["held", "confirmed"])
        .lt("starts_at", toIso)
        .gt("block_until", fromIso);
      if (error) throw new Error(`listActive: ${error.message}`);
      return data ?? [];
    },
    async listConfirmedStartingBetween(fromIso, toIso) {
      const { data, error } = await db
        .from("sessions")
        .select("*")
        .eq("status", "confirmed")
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso);
      if (error) throw new Error(`listConfirmedStartingBetween: ${error.message}`);
      return data ?? [];
    },
    async listUnfulfilled() {
      const { data, error } = await db
        .from("sessions")
        .select("*")
        .eq("status", "confirmed")
        .is("fulfilled_at", null)
        .gt("starts_at", new Date().toISOString());
      if (error) throw new Error(`listUnfulfilled: ${error.message}`);
      return data ?? [];
    },
    async markCompleted(nowIso) {
      const { data, error } = await db
        .from("sessions")
        .update({ status: "completed" })
        .eq("status", "confirmed")
        .lt("ends_at", nowIso)
        .select("id");
      if (error) throw new Error(`markCompleted: ${error.message}`);
      return data?.length ?? 0;
    },

    async listBlocked(fromIso, toIso) {
      const { data, error } = await db.from("blocked_times").select("starts_at, ends_at").lt("starts_at", toIso).gt("ends_at", fromIso);
      if (error) throw new Error(`listBlocked: ${error.message}`);
      return data ?? [];
    },
    async getSettings() {
      return unwrap(await db.from("app_settings").select("*").eq("id", 1).single(), "getSettings");
    },

    async findTrialClaim(q) {
      let query = db.from("trial_claims").select("*");
      const ors = [`email_hash.eq.${q.emailHash}`];
      if (q.cardFingerprint) ors.push(`card_fingerprint.eq.${q.cardFingerprint}`);
      if (q.phoneHash) ors.push(`phone_hash.eq.${q.phoneHash}`);
      query = query.or(ors.join(","));
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw new Error(`findTrialClaim: ${error.message}`);
      return data;
    },
    async insertTrialClaim(row) {
      const { error } = await db.from("trial_claims").insert(row);
      if (!error) return "ok";
      if (error.code === "23505") return "conflict";
      throw new Error(`insertTrialClaim: ${error.message}`);
    },

    async claimStripeEvent(eventId, type) {
      const { error } = await db.from("stripe_events").insert({ event_id: eventId, type });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(`claimStripeEvent: ${error.message}`);
    },
    async insertPaymentFailure(row) {
      const { error } = await db.from("payment_failures").insert(row);
      if (error) throw new Error(`insertPaymentFailure: ${error.message}`);
    },
  };
}
