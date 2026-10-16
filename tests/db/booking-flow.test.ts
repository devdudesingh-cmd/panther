import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { createTestDb, type TestDb } from "./harness";
import { pgliteRepo } from "./pglite-repo";
import { fakeProviders } from "./fakes";
import { createBookingService, type BookingService, type StripeEventLike } from "@/lib/booking/service";
import { config } from "@/config";
import { BookingError } from "@/lib/errors";

process.env.HASH_PEPPER ??= "test-pepper";

/** Next weekday 4:00 PM Los Angeles, at least `daysAhead` days out (inside business hours). */
function laSlot(daysAhead = 3, hour = 16): string {
  let d = DateTime.now().setZone(config.businessHours.timeZone).plus({ days: daysAhead }).set({ hour, minute: 0, second: 0, millisecond: 0 });
  while (d.weekday > 5) d = d.plus({ days: 1 });
  return d.toUTC().toISO()!;
}

function checkoutCompleted(opts: { id?: string; sessionId: string; mode: "payment" | "setup"; checkoutId?: string; pi?: string; si?: string }): StripeEventLike {
  return {
    id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: opts.checkoutId ?? `cs_evt_${Math.random().toString(36).slice(2)}`,
        mode: opts.mode,
        payment_status: opts.mode === "payment" ? "paid" : "no_payment_required",
        payment_intent: opts.pi ?? (opts.mode === "payment" ? "pi_1" : null),
        setup_intent: opts.si ?? (opts.mode === "setup" ? "seti_1" : null),
        client_reference_id: opts.sessionId,
        metadata: { session_id: opts.sessionId },
      },
    },
  };
}

describe("booking flow (service + real SQL + fake providers)", () => {
  let t: TestDb;
  let fakes: ReturnType<typeof fakeProviders>;
  let svc: BookingService;
  let parent: string;
  let clock = new Date();

  const base = (p: string, kind: "trial" | "paid", startsAt = laSlot()) => ({
    parentId: p,
    kind,
    startsAt,
    child: { firstName: "Maya", grade: 3 },
    topic: "Fractions",
    parentTz: "America/New_York",
    fullName: "Jordan Rivera",
    phone: "(555) 010-2030",
    adultGuardian: true,
    consent: { accepted: true, policyVersion: "2026-10-16", ipHash: "abc", userAgent: "vitest" },
  });

  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.db.close();
  });
  beforeEach(async () => {
    await t.db.exec(`delete from sessions; delete from trial_claims; delete from stripe_events; delete from payment_failures; delete from blocked_times;`);
    fakes = fakeProviders();
    clock = new Date();
    svc = createBookingService({ repo: pgliteRepo(t.db), ...fakes, siteUrl: "https://panther.test", now: () => clock });
    parent = await t.createParent(`p-${Math.random().toString(36).slice(2)}@gmail.com`);
  });

  it("slots: shows open LA business-hours slots in the parent's zone and hides full ones", async () => {
    const from = DateTime.now().plus({ days: 2 }).toISODate()!;
    const to = DateTime.now().plus({ days: 9 }).toISODate()!;
    const open = await svc.slots({ kind: "paid", fromDate: from, toDate: to, parentTz: "America/New_York" });
    const days = Object.keys(open);
    expect(days.length).toBeGreaterThan(3);
    const first = open[days[0]][0];
    expect(first.seatsLeft).toBe(config.sessions.maxSimultaneous);
    // every slot starts inside LA business hours
    for (const day of days)
      for (const s of open[day]) {
        const la = DateTime.fromISO(s.startsAt).setZone("America/Los_Angeles");
        const windows = config.businessHours.windows[(la.weekday % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6] ?? [];
        expect(windows.some((w) => la.toFormat("HH:mm") >= w.start && la.toFormat("HH:mm") < w.end)).toBe(true);
      }
    // fill a slot to capacity → disappears
    for (let i = 0; i < config.sessions.maxSimultaneous; i++) {
      const p = await t.createParent(`fill${i}-${Math.random().toString(36).slice(2)}@example.com`);
      await svc.hold(base(p, "paid", first.startsAt));
    }
    const after = await svc.slots({ kind: "paid", fromDate: from, toDate: to, parentTz: "America/New_York" });
    expect(after[days[0]]?.some((s) => s.startsAt === first.startsAt) ?? false).toBe(false);
  });

  it("book paid: hold → checkout → webhook confirms → fulfilled (Meet, email, bot)", async () => {
    const start = laSlot();
    const { sessionId, checkoutUrl } = await svc.hold(base(parent, "paid", start));
    expect(checkoutUrl).toMatch(/^https:\/\/checkout/);
    expect(fakes.log.checkouts[0]).toMatchObject({ kind: "paid", amountCents: 1900 });

    let s = (await pgliteRepo(t.db).getSession(sessionId))!;
    expect(s.status).toBe("held");
    expect(s.stripe_checkout_id).toBe("cs_test_1");
    const consent = await t.db.query(`select policy_version from consents where session_id = $1`, [sessionId]);
    expect(consent.rows).toHaveLength(1);

    // The success page never confirms — only the webhook does.
    const res = await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment", checkoutId: "cs_test_1", pi: "pi_abc" }));
    expect(res).toMatchObject({ handled: true, note: "confirmed" });

    s = (await pgliteRepo(t.db).getSession(sessionId))!;
    expect(s.status).toBe("confirmed");
    expect(s.paid_at).toBeTruthy();
    expect(s.stripe_payment_intent).toBe("pi_abc");
    expect(s.meet_url).toMatch(/meet\.google\.com/);
    expect(s.calendar_event_id).toBeTruthy();
    expect(s.recall_bot_id).toBe(fakes.log.bots[0].botId);
    expect(s.fulfilled_at).toBeTruthy();
    expect(s.confirmation_sent_at).toBeTruthy();

    // bot joins 2 min before start
    expect(Date.parse(start) - Date.parse(fakes.log.bots[0].joinAt)).toBe(config.sessions.tutorJoinLeadMinutes * 60_000);
    expect(fakes.log.bots[0].meetUrl).toBe(s.meet_url);

    expect(fakes.log.emails).toHaveLength(1);
    expect(fakes.log.emails[0].subject).toMatch(/You're booked/);
    expect(fakes.log.emails[0].html).toContain(`/dashboard/s/${sessionId}`); // notes upload link
    expect(fakes.log.emails[0].text).toContain("your Panther tutor will join");
  });

  it("webhook replay is idempotent: same event id twice does nothing the second time", async () => {
    const { sessionId } = await svc.hold(base(parent, "paid"));
    const evt = checkoutCompleted({ id: "evt_same", sessionId, mode: "payment" });
    await svc.handleStripeEvent(evt);
    const again = await svc.handleStripeEvent(evt);
    expect(again).toMatchObject({ duplicate: true });
    // a different event id for the same checkout is also a no-op
    const third = await svc.handleStripeEvent(checkoutCompleted({ id: "evt_other", sessionId, mode: "payment" }));
    expect(third.note).toBe("already confirmed");
    expect(fakes.log.bots).toHaveLength(1);
    expect(fakes.log.emails).toHaveLength(1);
  });

  it("book trial: $0 setup-mode checkout, confirmed by webhook, claim recorded with email + card hashes", async () => {
    const { sessionId } = await svc.hold(base(parent, "trial"));
    expect(fakes.log.checkouts[0]).toMatchObject({ kind: "trial", amountCents: 0 });
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "setup", si: "seti_x" }));
    const s = (await pgliteRepo(t.db).getSession(sessionId))!;
    expect(s.status).toBe("confirmed");
    expect(s.paid_at).toBeNull();
    expect(s.stripe_setup_intent).toBe("seti_x");
    const claims = await t.db.query<{ card_fingerprint: string; email_hash: string; phone_hash: string | null }>(`select * from trial_claims`);
    expect(claims.rows).toHaveLength(1);
    expect(claims.rows[0].card_fingerprint).toBe("fp_default");
    expect(claims.rows[0].email_hash).toHaveLength(64);
    expect(claims.rows[0].phone_hash).toHaveLength(64);
  });

  it("one trial per family: same card on a new email is refused at the webhook and the parent is told", async () => {
    const { sessionId: first } = await svc.hold(base(parent, "trial"));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId: first, mode: "setup" }));

    const other = await t.createParent(`other-${Math.random().toString(36).slice(2)}@example.com`);
    const { sessionId: second } = await svc.hold({ ...base(other, "trial", laSlot(4)), phone: "(555) 999-0000" });
    const res = await svc.handleStripeEvent(checkoutCompleted({ sessionId: second, mode: "setup", si: "seti_2" }));
    expect(res.note).toBe("trial already used");
    const s = (await pgliteRepo(t.db).getSession(second))!;
    expect(s.status).toBe("cancelled");
    expect(s.cancel_reason).toBe("trial_already_used");
    expect(fakes.log.bots).toHaveLength(1); // no second bot
    expect(fakes.log.emails.at(-1)?.subject).toMatch(/free trial/i);
    expect(fakes.log.emails.at(-1)?.text).toMatch(/already used/);
  });

  it("one trial per family: gmail dots/plus variants of a claimed email are refused before Stripe", async () => {
    const email = `family.name@gmail.com`;
    const p1 = await t.createParent(email);
    const { sessionId } = await svc.hold(base(p1, "trial"));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "setup" }));

    const p2 = await t.createParent(`familyname+kid2@gmail.com`);
    await expect(svc.hold(base(p2, "trial", laSlot(4)))).rejects.toMatchObject({ code: "TRIAL_USED" });
    expect(fakes.log.checkouts).toHaveLength(1);

    // same phone number is a third signal
    const p3 = await t.createParent(`totally-new-${Math.random().toString(36).slice(2)}@example.com`);
    await expect(svc.hold(base(p3, "trial", laSlot(4)))).rejects.toMatchObject({ code: "TRIAL_USED" });
    // …but a different family with a different phone is fine
    const p4 = await t.createParent(`new-${Math.random().toString(36).slice(2)}@example.com`);
    fakes.state.fingerprint = "fp_other";
    const ok = await svc.hold({ ...base(p4, "trial", laSlot(4)), phone: "(555) 777-1234" });
    expect(ok.checkoutUrl).toBeTruthy();
  });

  it("the same parent can't book a second trial even after cancelling the first", async () => {
    const { sessionId } = await svc.hold(base(parent, "trial"));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "setup" }));
    await svc.cancel({ sessionId, parentId: parent });
    await expect(svc.hold(base(parent, "trial", laSlot(5)))).rejects.toMatchObject({ code: "TRIAL_USED" });
    await expect(svc.hold(base(parent, "paid", laSlot(5)))).resolves.toBeTruthy();
  });

  it("double booking: the last seat can't be taken twice, and the loser gets a friendly error", async () => {
    const start = laSlot();
    for (let i = 0; i < config.sessions.maxSimultaneous; i++) {
      const p = await t.createParent(`d${i}-${Math.random().toString(36).slice(2)}@example.com`);
      await svc.hold(base(p, "paid", start));
    }
    const late = await t.createParent(`late-${Math.random().toString(36).slice(2)}@example.com`);
    const err = await svc.hold(base(late, "paid", start)).catch((e) => e);
    expect(err).toBeInstanceOf(BookingError);
    expect(err.code).toBe("SLOT_FULL");
    expect(err.status).toBe(409);
  });

  it("late payment after the hold expired: re-holds when the seat is still free, refunds when it isn't", async () => {
    const start = laSlot();
    const { sessionId } = await svc.hold(base(parent, "paid", start));
    await t.db.query(`update sessions set status = 'expired' where id = $1`, [sessionId]);
    // seat still free → revived and confirmed
    const res = await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment", pi: "pi_late" }));
    expect(res.note).toBe("confirmed");
    expect(fakes.log.refunds).toHaveLength(0);

    // now fill the time and try again with another expired hold
    const others = await Promise.all(
      Array.from({ length: config.sessions.maxSimultaneous - 1 }, (_, i) => t.createParent(`o${i}-${Math.random().toString(36).slice(2)}@example.com`)),
    );
    for (const o of others) await svc.hold(base(o, "paid", start));
    const victim = await t.createParent(`v-${Math.random().toString(36).slice(2)}@example.com`);
    const { sessionId: s2 } = await svc.hold(base(victim, "paid", new Date(Date.parse(start) + 3 * 3_600_000).toISOString()));
    // move it onto the full time directly (simulating it having been held before the others), then expire it
    await t.db.query(`update sessions set status = 'expired', starts_at = $2, ends_at = $2::timestamptz + interval '40 min', block_until = $2::timestamptz + interval '50 min' where id = $1`, [s2, start]);
    const res2 = await svc.handleStripeEvent(checkoutCompleted({ sessionId: s2, mode: "payment", pi: "pi_victim" }));
    expect(res2.note).toMatch(/late payment, SLOT_FULL/);
    expect(fakes.log.refunds).toEqual(["pi_victim"]);
    const s = (await pgliteRepo(t.db).getSession(s2))!;
    expect(s.status).toBe("cancelled");
    expect(s.stripe_refund_id).toBeTruthy();
    expect(fakes.log.emails.at(-1)?.subject).toMatch(/refunded/);
  });

  it("cancel ≥24h ahead: refund, bot cancelled, calendar event deleted, email sent", async () => {
    const { sessionId } = await svc.hold(base(parent, "paid", laSlot(3)));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment", pi: "pi_c" }));
    const { session, refunded } = await svc.cancel({ sessionId, parentId: parent });
    expect(refunded).toBe(true);
    expect(session.status).toBe("cancelled");
    expect(session.stripe_refund_id).toBeTruthy();
    expect(fakes.log.refunds).toEqual(["pi_c"]);
    expect(fakes.log.cancelledBots).toEqual([fakes.log.bots[0].botId]);
    expect(fakes.log.deletedEvents).toEqual([session.calendar_event_id]);
    expect(fakes.log.emails.at(-1)?.text).toMatch(/refund is on its way/);
    // the seat is free again
    const again = await svc.hold(base(await t.createParent(`z-${Math.random().toString(36).slice(2)}@example.com`), "paid", laSlot(3)));
    expect(again.sessionId).toBeTruthy();
  });

  it("cancel <24h ahead: no refund (but still cancelled); reschedule refused; admin cancel always refunds", async () => {
    const start = laSlot(3);
    const { sessionId } = await svc.hold(base(parent, "paid", start));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment", pi: "pi_x" }));
    clock = new Date(Date.parse(start) - 5 * 3_600_000); // 5 hours before
    await expect(svc.reschedule({ sessionId, parentId: parent, startsAt: laSlot(6) })).rejects.toMatchObject({ code: "TOO_LATE" });
    const { refunded, session } = await svc.cancel({ sessionId, parentId: parent });
    expect(refunded).toBe(false);
    expect(session.status).toBe("cancelled");
    expect(fakes.log.emails.at(-1)?.text).toMatch(/isn't refundable/);

    const { sessionId: s2 } = await svc.hold(base(parent, "paid", laSlot(4)));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId: s2, mode: "payment", pi: "pi_y" }));
    clock = new Date(Date.parse(laSlot(4)) - 3_600_000);
    const admin = await svc.cancel({ sessionId: s2, parentId: null });
    expect(admin.refunded).toBe(true);
  });

  it("a parent can't cancel or see someone else's session", async () => {
    const { sessionId } = await svc.hold(base(parent, "paid"));
    const other = await t.createParent(`x-${Math.random().toString(36).slice(2)}@example.com`);
    await expect(svc.cancel({ sessionId, parentId: other })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reschedule: moves the session, updates calendar + bot, resets reminders, emails", async () => {
    const { sessionId } = await svc.hold(base(parent, "paid", laSlot(3)));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment" }));
    await t.db.query(`update sessions set reminder_24h_sent_at = now() where id = $1`, [sessionId]);
    const target = laSlot(6, 17);
    const moved = await svc.reschedule({ sessionId, parentId: parent, startsAt: target });
    expect(moved.starts_at).toBe(target);
    expect(moved.reminder_24h_sent_at).toBeNull();
    expect(fakes.log.updatedEvents[0]).toMatchObject({ eventId: moved.calendar_event_id, startsAt: target });
    expect(fakes.log.cancelledBots).toEqual(["bot_2"]);
    expect(moved.recall_bot_id).toBe(fakes.log.bots.at(-1)!.botId);
    expect(fakes.log.emails.at(-1)?.subject).toMatch(/Moved/);
    await expect(svc.reschedule({ sessionId, parentId: parent, startsAt: laSlot(8, 2) })).rejects.toMatchObject({ code: "SLOT_OUTSIDE_HOURS" });
  });

  it("fulfillment retries: Google outage → error stored + owner alerted once → cron fulfills later", async () => {
    fakes.state.failMeeting = true;
    const { sessionId } = await svc.hold(base(parent, "paid"));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment" }));
    let s = (await pgliteRepo(t.db).getSession(sessionId))!;
    expect(s.status).toBe("confirmed");
    expect(s.fulfilled_at).toBeNull();
    expect(s.fulfillment_error).toMatch(/Google is down/);
    expect(fakes.log.alerts).toHaveLength(1);

    let tick = await svc.tick();
    expect(tick.errors).toBe(1);
    expect(fakes.log.alerts).toHaveLength(1); // not re-alerted

    fakes.state.failMeeting = false;
    tick = await svc.tick();
    expect(tick.fulfilled).toBe(1);
    s = (await pgliteRepo(t.db).getSession(sessionId))!;
    expect(s.fulfilled_at).toBeTruthy();
    expect(s.fulfillment_error).toBeNull();
    expect(s.recall_bot_id).toBeTruthy();
    expect(fakes.log.emails).toHaveLength(1);
  });

  it("cron: expires stale holds, sends 24h and 1h reminders exactly once, marks past sessions completed", async () => {
    const start = laSlot(3);
    const { sessionId } = await svc.hold(base(parent, "paid", start));
    await svc.handleStripeEvent(checkoutCompleted({ sessionId, mode: "payment" }));
    const abandoned = await svc.hold(base(await t.createParent(`ab-${Math.random().toString(36).slice(2)}@example.com`), "paid", laSlot(4)));
    await t.db.query(`update sessions set hold_expires_at = now() - interval '1 min' where id = $1`, [abandoned.sessionId]);

    let r = await svc.tick();
    expect(r.expired).toBe(1);
    expect(r.reminders).toBe(0); // 3 days out: nothing yet

    clock = new Date(Date.parse(start) - 23.5 * 3_600_000);
    r = await svc.tick();
    expect(r.reminders).toBe(1);
    expect(fakes.log.emails.at(-1)?.subject).toMatch(/Tomorrow/);
    r = await svc.tick();
    expect(r.reminders).toBe(0); // not twice

    clock = new Date(Date.parse(start) - 50 * 60_000);
    r = await svc.tick();
    expect(r.reminders).toBe(1);
    expect(fakes.log.emails.at(-1)?.subject).toMatch(/Starting soon/);
    r = await svc.tick();
    expect(r.reminders).toBe(0);

    clock = new Date(Date.parse(start) + 2 * 3_600_000);
    r = await svc.tick();
    expect(r.completed).toBe(1);
    const s = (await pgliteRepo(t.db).getSession(sessionId))!;
    expect(s.status).toBe("completed");
  });

  it("refuses bookings outside hours, too soon, too far, past, with a missing consent, or wrong grade", async () => {
    const soon = new Date(Date.now() + 30 * 60_000).toISOString();
    await expect(svc.hold(base(parent, "paid", soon))).rejects.toMatchObject({ code: expect.stringMatching(/SLOT_TOO_SOON|SLOT_OUTSIDE_HOURS/) });
    await expect(svc.hold(base(parent, "paid", laSlot(3, 2)))).rejects.toMatchObject({ code: "SLOT_OUTSIDE_HOURS" });
    await expect(svc.hold(base(parent, "paid", laSlot(45)))).rejects.toMatchObject({ code: "SLOT_TOO_FAR" });
    await expect(svc.hold({ ...base(parent, "paid"), consent: { ...base(parent, "paid").consent, accepted: false } })).rejects.toMatchObject({ code: "INVALID" });
    await expect(svc.hold({ ...base(parent, "paid"), adultGuardian: false })).rejects.toMatchObject({ code: "INVALID" });
    await expect(svc.hold({ ...base(parent, "paid"), child: { firstName: "Maya", grade: 7 } })).rejects.toMatchObject({ code: "INVALID" });
    expect(fakes.log.checkouts).toHaveLength(0);
  });

  it("payment failures are recorded for the admin view", async () => {
    const { sessionId } = await svc.hold(base(parent, "paid"));
    await svc.handleStripeEvent({
      id: "evt_pf",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_fail", metadata: { session_id: sessionId }, last_payment_error: { message: "Your card was declined." } } },
    });
    const rows = await t.db.query<{ reason: string; session_id: string }>(`select reason, session_id from payment_failures`);
    expect(rows.rows[0]).toMatchObject({ reason: "Your card was declined.", session_id: sessionId });
  });
});
