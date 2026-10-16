import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, pgErrorCode, type TestDb } from "./harness";

const MAX_SEATS = 3;
const BUFFER = 10;
const HOLD = 10;

/** A start time comfortably in the future, on a 10-minute mark. */
function future(hoursAhead: number, minutes = 0): Date {
  const d = new Date(Date.now() + hoursAhead * 3_600_000);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10 + minutes);
  return d;
}

type SessionRow = {
  id: string;
  seat: number;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  block_until: Date | string;
  hold_expires_at: Date | string;
};

describe("booking engine (Postgres)", () => {
  let t: TestDb;
  let parent: string;

  async function book(
    parentId: string,
    kind: "trial" | "paid",
    startsAt: Date,
    opts: { minutes?: number; maxSeats?: number; buffer?: number; child?: string | null } = {},
  ): Promise<SessionRow> {
    const minutes = opts.minutes ?? (kind === "trial" ? 25 : 40);
    const r = await t.db.query<SessionRow>(
      `select * from book_slot($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        parentId,
        opts.child ?? null,
        kind,
        startsAt.toISOString(),
        minutes,
        opts.buffer ?? BUFFER,
        opts.maxSeats ?? MAX_SEATS,
        HOLD,
        "Fractions",
        kind === "trial" ? 0 : 1900,
        "America/New_York",
      ],
    );
    return r.rows[0];
  }

  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.db.close();
  });
  beforeEach(async () => {
    await t.db.exec(`delete from sessions; delete from blocked_times; update app_settings set bookings_paused = false;`);
    parent = await t.createParent(`p-${Math.random().toString(36).slice(2)}@example.com`);
  });

  it("creates the parent row automatically when an auth user is created", async () => {
    const r = await t.db.query<{ email: string }>(`select email from parents where id = $1`, [parent]);
    expect(r.rows).toHaveLength(1);
  });

  it("holds a slot for 10 minutes on seat 1 with the buffer applied", async () => {
    const start = future(24);
    const s = await book(parent, "paid", start);
    expect(s.status).toBe("held");
    expect(s.seat).toBe(1);
    expect(new Date(s.ends_at).getTime() - start.getTime()).toBe(40 * 60_000);
    expect(new Date(s.block_until).getTime() - start.getTime()).toBe(50 * 60_000);
    const holdMs = new Date(s.hold_expires_at).getTime() - Date.now();
    expect(holdMs).toBeGreaterThan(9 * 60_000);
    expect(holdMs).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });

  it("fills seats 1..3 for the same time, then refuses a 4th (SLOT_FULL)", async () => {
    const start = future(24);
    const seats: number[] = [];
    for (let i = 0; i < MAX_SEATS; i++) {
      const p = await t.createParent(`seat${i}-${Math.random().toString(36).slice(2)}@example.com`);
      seats.push((await book(p, "paid", start)).seat);
    }
    expect(seats.sort()).toEqual([1, 2, 3]);
    const extra = await t.createParent(`extra-${Math.random().toString(36).slice(2)}@example.com`);
    await expect(book(extra, "paid", start)).rejects.toSatisfy((e) => pgErrorCode(e) === "SLOT_FULL");
  });

  it("enforces the 10-minute buffer between sessions on a seat", async () => {
    const start = future(24);
    await book(parent, "paid", start, { maxSeats: 1 }); // occupies [start, start+40), blocks until +50
    const other = await t.createParent(`b-${Math.random().toString(36).slice(2)}@example.com`);
    // 45 min later: inside the buffer → full
    await expect(book(other, "paid", new Date(start.getTime() + 45 * 60_000), { maxSeats: 1 })).rejects.toSatisfy(
      (e) => pgErrorCode(e) === "SLOT_FULL",
    );
    // 50 min later: exactly after the buffer → ok
    const ok = await book(other, "paid", new Date(start.getTime() + 50 * 60_000), { maxSeats: 1 });
    expect(ok.seat).toBe(1);
  });

  it("the buffer also protects a session that starts right before an existing one", async () => {
    const start = future(24);
    await book(parent, "paid", start, { maxSeats: 1 });
    const other = await t.createParent(`c-${Math.random().toString(36).slice(2)}@example.com`);
    // A 40-min session ending 5 min before `start` would leave only a 5-min gap → full
    await expect(book(other, "paid", new Date(start.getTime() - 45 * 60_000), { maxSeats: 1 })).rejects.toSatisfy(
      (e) => pgErrorCode(e) === "SLOT_FULL",
    );
    const ok = await book(other, "paid", new Date(start.getTime() - 50 * 60_000), { maxSeats: 1 });
    expect(ok.seat).toBe(1);
  });

  it("survives a double-booking race: concurrent requests for the last seat", async () => {
    const start = future(24);
    // Capacity 1 → exactly one of N simultaneous attempts may win. PGlite serializes
    // statements, so this exercises the constraint logic rather than true parallelism;
    // the exclusion constraint is what makes real concurrent transactions safe too.
    const parents = await Promise.all(
      Array.from({ length: 6 }, (_, i) => t.createParent(`race${i}-${Math.random().toString(36).slice(2)}@example.com`)),
    );
    const results = await Promise.allSettled(parents.map((p) => book(p, "paid", start, { maxSeats: 1 })));
    const wins = results.filter((r) => r.status === "fulfilled");
    const losses = results.filter((r) => r.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(5);
    for (const l of losses) expect(pgErrorCode((l as PromiseRejectedResult).reason)).toBe("SLOT_FULL");
    const active = await t.db.query<{ n: number }>(
      `select count(*)::int as n from sessions where status in ('held','confirmed')`,
    );
    expect(active.rows[0].n).toBe(1);
  });

  it("the exclusion constraint rejects a direct overlapping insert, bypassing book_slot()", async () => {
    const start = future(24);
    const s = await book(parent, "paid", start);
    await expect(
      t.db.query(
        `insert into sessions (parent_id, kind, status, starts_at, ends_at, block_until, seat)
         values ($1, 'paid', 'confirmed', $2, $3, $4, $5)`,
        [
          await t.createParent(`d-${Math.random().toString(36).slice(2)}@example.com`),
          new Date(start.getTime() + 20 * 60_000).toISOString(),
          new Date(start.getTime() + 60 * 60_000).toISOString(),
          new Date(start.getTime() + 70 * 60_000).toISOString(),
          s.seat,
        ],
      ),
    ).rejects.toThrow(/sessions_seat_no_overlap/);
  });

  it("expired holds free the seat", async () => {
    const start = future(24);
    const s = await book(parent, "paid", start, { maxSeats: 1 });
    await t.db.query(`update sessions set hold_expires_at = now() - interval '1 minute' where id = $1`, [s.id]);
    const other = await t.createParent(`e-${Math.random().toString(36).slice(2)}@example.com`);
    const again = await book(other, "paid", start, { maxSeats: 1 });
    expect(again.seat).toBe(1);
    const old = await t.db.query<{ status: string }>(`select status from sessions where id = $1`, [s.id]);
    expect(old.rows[0].status).toBe("expired");
  });

  it("a parent can't hold two overlapping sessions (PARENT_OVERLAP)", async () => {
    const start = future(24);
    await book(parent, "paid", start);
    await expect(book(parent, "paid", new Date(start.getTime() + 10 * 60_000))).rejects.toSatisfy(
      (e) => pgErrorCode(e) === "PARENT_OVERLAP",
    );
  });

  it("one free trial per parent: second trial is TRIAL_USED, even after cancelling", async () => {
    const trial = await book(parent, "trial", future(24));
    await expect(book(parent, "trial", future(48))).rejects.toSatisfy((e) => pgErrorCode(e) === "TRIAL_USED");
    await t.db.query(`update sessions set status = 'cancelled' where id = $1`, [trial.id]);
    await expect(book(parent, "trial", future(48))).rejects.toSatisfy((e) => pgErrorCode(e) === "TRIAL_USED");
    // but an expired (abandoned) hold does not count
    await t.db.query(`update sessions set status = 'expired' where id = $1`, [trial.id]);
    const retry = await book(parent, "trial", future(48));
    expect(retry.status).toBe("held");
    // and a paid session is always fine
    const paid = await book(parent, "paid", future(72));
    expect(paid.status).toBe("held");
  });

  it("trial_claims: same email or card fingerprint can't be claimed twice", async () => {
    await t.db.query(`insert into trial_claims (email_hash, card_fingerprint) values ('h1', 'fp1')`);
    await expect(t.db.query(`insert into trial_claims (email_hash, card_fingerprint) values ('h1', 'fp2')`)).rejects.toThrow(
      /trial_claims_email_hash_key/,
    );
    await expect(t.db.query(`insert into trial_claims (email_hash, card_fingerprint) values ('h2', 'fp1')`)).rejects.toThrow(
      /trial_claims_card_fingerprint_key/,
    );
  });

  it("blocked times and the pause switch refuse bookings", async () => {
    const start = future(24);
    await t.db.query(`insert into blocked_times (starts_at, ends_at, reason) values ($1, $2, 'holiday')`, [
      new Date(start.getTime() - 60 * 60_000).toISOString(),
      new Date(start.getTime() + 60 * 60_000).toISOString(),
    ]);
    await expect(book(parent, "paid", start)).rejects.toSatisfy((e) => pgErrorCode(e) === "SLOT_BLOCKED");
    await t.db.exec(`delete from blocked_times; update app_settings set bookings_paused = true;`);
    await expect(book(parent, "paid", start)).rejects.toSatisfy((e) => pgErrorCode(e) === "BOOKINGS_PAUSED");
  });

  it("refuses a start time in the past", async () => {
    await expect(book(parent, "paid", new Date(Date.now() - 60_000))).rejects.toSatisfy(
      (e) => pgErrorCode(e) === "SLOT_PAST",
    );
  });

  it("move_session reschedules within capacity and clears reminder flags", async () => {
    const start = future(24);
    const s = await book(parent, "paid", start, { maxSeats: 1 });
    await t.db.query(`update sessions set status = 'confirmed', reminder_24h_sent_at = now() where id = $1`, [s.id]);
    const other = await t.createParent(`f-${Math.random().toString(36).slice(2)}@example.com`);
    const blocker = future(48);
    await book(other, "paid", blocker, { maxSeats: 1 });
    // can't move onto the other parent's slot
    await expect(
      t.db.query(`select * from move_session($1, $2, $3, $4)`, [s.id, blocker.toISOString(), BUFFER, 1]),
    ).rejects.toSatisfy((e) => pgErrorCode(e) === "SLOT_FULL");
    // can move to a free time
    const target = new Date(blocker.getTime() + 60 * 60_000);
    const moved = await t.db.query<SessionRow & { reminder_24h_sent_at: Date | null }>(
      `select * from move_session($1, $2, $3, $4)`,
      [s.id, target.toISOString(), BUFFER, 1],
    );
    expect(new Date(moved.rows[0].starts_at).getTime()).toBe(target.getTime());
    expect(moved.rows[0].status).toBe("confirmed");
    expect(moved.rows[0].reminder_24h_sent_at).toBeNull();
  });

  it("delete_child_data scrubs the child and anything describing them", async () => {
    const child = await t.db.query<{ id: string }>(
      `insert into children (parent_id, first_name, grade) values ($1, 'Maya', 3) returning id`,
      [parent],
    );
    const s = await book(parent, "paid", future(24), { child: child.rows[0].id });
    await t.db.query(`update sessions set recap = 'Maya did great', practice = '[1]'::jsonb where id = $1`, [s.id]);
    await t.db.query(
      `insert into session_files (session_id, parent_id, storage_path, file_name) values ($1, $2, 'notes/x/y.png', 'y.png')`,
      [s.id, parent],
    );
    await t.db.query(`select delete_child_data($1, $2)`, [parent, child.rows[0].id]);
    const kids = await t.db.query(`select 1 from children where id = $1`, [child.rows[0].id]);
    expect(kids.rows).toHaveLength(0);
    const row = await t.db.query<{ recap: string | null; practice: unknown; child_id: string | null; topic: string | null }>(
      `select recap, practice, child_id, topic from sessions where id = $1`,
      [s.id],
    );
    expect(row.rows[0]).toEqual({ recap: null, practice: null, child_id: null, topic: null });
    const files = await t.db.query(`select 1 from session_files where session_id = $1`, [s.id]);
    expect(files.rows).toHaveLength(0);
  });
});

describe("row-level security", () => {
  let t: TestDb;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    t = await createTestDb();
    alice = await t.createParent("alice@example.com");
    bob = await t.createParent("bob@example.com");
    await t.db.query(
      `select book_slot($1, null, 'paid', $2, 40, 10, 3, 10, 'Division', 1900, 'America/Los_Angeles')`,
      [alice, new Date(Date.now() + 86_400_000).toISOString()],
    );
    await t.db.query(`insert into children (parent_id, first_name, grade) values ($1, 'Ada', 2)`, [alice]);
    await t.db.query(`insert into trial_claims (email_hash) values ('secret-hash')`);
  });
  afterAll(async () => {
    await t.db.close();
  });

  it("a parent sees only their own sessions, children and profile", async () => {
    await t.asParent(alice, async () => {
      expect((await t.db.query(`select id from sessions`)).rows).toHaveLength(1);
      expect((await t.db.query(`select id from children`)).rows).toHaveLength(1);
      expect((await t.db.query(`select email from parents`)).rows).toEqual([{ email: "alice@example.com" }]);
    });
    await t.asParent(bob, async () => {
      expect((await t.db.query(`select id from sessions`)).rows).toHaveLength(0);
      expect((await t.db.query(`select id from children`)).rows).toHaveLength(0);
      expect((await t.db.query(`select email from parents`)).rows).toEqual([{ email: "bob@example.com" }]);
    });
  });

  it("parents can't write sessions or read ops tables, and can't add a child to someone else", async () => {
    await t.asParent(bob, async () => {
      await expect(t.db.query(`update sessions set status = 'confirmed'`)).resolves.toMatchObject({ affectedRows: 0 });
      await expect(
        t.db.query(
          `insert into sessions (parent_id, kind, starts_at, ends_at, block_until, seat) values ($1, 'paid', now() + interval '2 day', now() + interval '2 day 40 min', now() + interval '2 day 50 min', 1)`,
          [bob],
        ),
      ).rejects.toThrow(/row-level security/);
      expect((await t.db.query(`select * from trial_claims`)).rows).toHaveLength(0);
      expect((await t.db.query(`select * from blocked_times`)).rows).toHaveLength(0);
      expect((await t.db.query(`select * from safety_flags`)).rows).toHaveLength(0);
      await expect(
        t.db.query(`insert into children (parent_id, first_name, grade) values ($1, 'Eve', 4)`, [alice]),
      ).rejects.toThrow(/row-level security/);
      await expect(t.db.query(`select book_slot($1, null, 'paid', now() + interval '3 day', 40, 10, 3, 10, null, 1900, null)`, [bob])).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("a parent can update their own profile but not someone else's", async () => {
    await t.asParent(bob, async () => {
      await t.db.query(`update parents set full_name = 'Bob B' where id = $1`, [bob]);
      const r = await t.db.query(`update parents set full_name = 'Hacked' where id = $1`, [alice]);
      expect(r.affectedRows).toBe(0);
    });
    const alice_row = await t.db.query<{ full_name: string | null }>(`select full_name from parents where id = $1`, [alice]);
    expect(alice_row.rows[0].full_name).toBeNull();
  });
});
