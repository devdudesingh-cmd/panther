import type { PGlite } from "@electric-sql/pglite";
import type { BookingRepo, BookSlotArgs } from "@/lib/booking/repo";
import type { AppSettingsRow, ChildRow, ParentRow, SessionRow, TrialClaimRow } from "@/lib/db/types";
import { BookingError, bookingErrorFromPg } from "@/lib/errors";

/**
 * BookingRepo over PGlite, so the booking service runs against the real
 * migration in tests. Mirrors supabaseRepo() one-to-one.
 */

function iso(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : v;
}
function row<T extends object>(r: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[k] = iso(v);
  return out as T;
}

export function pgliteRepo(db: PGlite): BookingRepo {
  async function one<T extends object>(sql: string, params: unknown[] = []): Promise<T | null> {
    const r = await db.query<Record<string, unknown>>(sql, params);
    return r.rows[0] ? row<T>(r.rows[0]) : null;
  }
  async function many<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await db.query<Record<string, unknown>>(sql, params);
    return r.rows.map((x) => row<T>(x));
  }
  async function rpc<T extends object>(sql: string, params: unknown[]): Promise<T> {
    try {
      const r = await one<T>(sql, params);
      if (!r) throw new BookingError("NOT_FOUND");
      return r;
    } catch (e) {
      throw bookingErrorFromPg(e) ?? e;
    }
  }
  async function patch(table: string, id: string, p: Record<string, unknown>) {
    const keys = Object.keys(p);
    if (keys.length === 0) return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const vals = keys.map((k) => (p[k] !== null && typeof p[k] === "object" ? JSON.stringify(p[k]) : p[k]));
    await db.query(`update ${table} set ${sets} where id = $1`, [id, ...vals]);
  }

  return {
    getParent: (id) => one<ParentRow>(`select * from parents where id = $1`, [id]),
    updateParent: (id, p) => patch("parents", id, p),
    getChild: (id, parentId) => one<ChildRow>(`select * from children where id = $1 and parent_id = $2`, [id, parentId]),
    async createChild(parentId, firstName, grade) {
      return (await one<ChildRow>(`insert into children (parent_id, first_name, grade) values ($1, $2, $3) returning *`, [parentId, firstName, grade]))!;
    },
    async insertConsent(c) {
      await db.query(`insert into consents (parent_id, session_id, policy_version, ip_hash, user_agent) values ($1,$2,$3,$4,$5)`, [
        c.parent_id,
        c.session_id,
        c.policy_version,
        c.ip_hash,
        c.user_agent,
      ]);
    },
    getSession: (id) => one<SessionRow>(`select * from sessions where id = $1`, [id]),
    getSessionByCheckout: (cid) => one<SessionRow>(`select * from sessions where stripe_checkout_id = $1`, [cid]),
    async updateSession(id, p) {
      await patch("sessions", id, p);
      return (await one<SessionRow>(`select * from sessions where id = $1`, [id]))!;
    },
    bookSlot: (a: BookSlotArgs) =>
      rpc<SessionRow>(`select * from book_slot($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
        a.parentId,
        a.childId,
        a.kind,
        a.startsAt,
        a.minutes,
        a.bufferMinutes,
        a.maxSeats,
        a.holdMinutes,
        a.topic,
        a.priceCents,
        a.parentTimezone,
      ]),
    moveSession: (id, startsAt, buffer, max) => rpc<SessionRow>(`select * from move_session($1,$2,$3,$4)`, [id, startsAt, buffer, max]),
    reviveHold: (id, buffer, max, hold) => rpc<SessionRow>(`select * from revive_hold($1,$2,$3,$4)`, [id, buffer, max, hold]),
    async expireStaleHolds() {
      const r = await db.query<{ n: number }>(`select expire_stale_holds() as n`);
      return r.rows[0].n;
    },
    listActive: (from, to) =>
      many<SessionRow>(`select * from sessions where status in ('held','confirmed') and starts_at < $2 and block_until > $1`, [from, to]),
    listConfirmedStartingBetween: (from, to) =>
      many<SessionRow>(`select * from sessions where status = 'confirmed' and starts_at >= $1 and starts_at < $2`, [from, to]),
    listUnfulfilled: () => many<SessionRow>(`select * from sessions where status = 'confirmed' and fulfilled_at is null and starts_at > now()`),
    async markCompleted(nowIso) {
      const r = await db.query(`update sessions set status = 'completed' where status = 'confirmed' and ends_at < $1`, [nowIso]);
      return r.affectedRows ?? 0;
    },
    listBlocked: (from, to) => many(`select starts_at, ends_at from blocked_times where starts_at < $2 and ends_at > $1`, [from, to]),
    async getSettings() {
      return (await one<AppSettingsRow>(`select * from app_settings where id = 1`))!;
    },
    findTrialClaim: (q) =>
      one<TrialClaimRow>(
        `select * from trial_claims where email_hash = $1 or ($2::text is not null and card_fingerprint = $2) or ($3::text is not null and phone_hash = $3) limit 1`,
        [q.emailHash, q.cardFingerprint ?? null, q.phoneHash ?? null],
      ),
    async insertTrialClaim(r) {
      try {
        await db.query(`insert into trial_claims (email_hash, card_fingerprint, phone_hash, parent_id, session_id) values ($1,$2,$3,$4,$5)`, [
          r.email_hash,
          r.card_fingerprint,
          r.phone_hash,
          r.parent_id,
          r.session_id,
        ]);
        return "ok";
      } catch (e) {
        if (/duplicate key|unique/.test((e as Error).message)) return "conflict";
        throw e;
      }
    },
    async claimStripeEvent(eventId, type) {
      try {
        await db.query(`insert into stripe_events (event_id, type) values ($1, $2)`, [eventId, type]);
        return true;
      } catch (e) {
        if (/duplicate key|unique/.test((e as Error).message)) return false;
        throw e;
      }
    },
    async insertPaymentFailure(r) {
      await db.query(`insert into payment_failures (parent_id, session_id, stripe_object_id, reason) values ($1,$2,$3,$4)`, [
        r.parent_id,
        r.session_id,
        r.stripe_object_id,
        r.reason,
      ]);
    },
  };
}
