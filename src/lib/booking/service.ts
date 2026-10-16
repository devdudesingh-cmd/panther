import { config, sessionMinutes, sessionPriceCents, type SessionKind } from "@/config";
import type { ChildRow, ParentRow, SessionRow } from "@/lib/db/types";
import { BookingError } from "@/lib/errors";
import { hashEmail, hashPhone } from "@/lib/hash";
import { availableSlots, validateStart, type Slot } from "@/lib/slots";
import { hoursUntil } from "@/lib/time";
import type { PaymentsProvider } from "@/lib/providers/stripe";
import type { MeetingProvider } from "@/lib/providers/google";
import type { EmailProvider } from "@/lib/providers/email";
import type { TutorBotProvider } from "@/lib/providers/recall";
import type { AlertProvider } from "@/lib/providers/sms";
import * as mail from "@/lib/email/templates";
import type { BookingRepo } from "./repo";

/**
 * Booking orchestration. Every external effect goes through an injected
 * provider so the whole flow is testable against real SQL with fakes.
 *
 * Invariants:
 *  - A paid booking is only ever confirmed from a Stripe webhook.
 *  - Every webhook handler is idempotent (stripe_events + status checks).
 *  - Fulfillment steps are skip-if-done, so retries are safe.
 */

export interface BookingDeps {
  repo: BookingRepo;
  payments: PaymentsProvider;
  meetings: MeetingProvider;
  email: EmailProvider;
  bot: TutorBotProvider;
  alerts: AlertProvider;
  siteUrl: string;
  now?: () => Date;
}

export interface HoldInput {
  parentId: string;
  kind: SessionKind;
  startsAt: string;
  child: { id?: string; firstName: string; grade: number };
  topic: string;
  parentTz: string;
  fullName?: string | null;
  phone?: string | null;
  adultGuardian: boolean;
  consent: { accepted: boolean; policyVersion: string; ipHash: string | null; userAgent: string | null };
}

/** The subset of a Stripe event the service relies on (keeps tests free of Stripe types). */
export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface SlotsInput {
  kind: SessionKind;
  fromDate: string;
  toDate: string;
  parentTz: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function createBookingService(deps: BookingDeps) {
  const { repo, payments, meetings, email, bot, alerts, siteUrl } = deps;
  const now = () => deps.now?.() ?? new Date();
  const S = config.sessions;

  async function ctx(session: SessionRow): Promise<{ session: SessionRow; parent: ParentRow; child: ChildRow | null; siteUrl: string; parentName: string | null; childName: string | null }> {
    const parent = await repo.getParent(session.parent_id);
    if (!parent) throw new Error(`Parent ${session.parent_id} missing for session ${session.id}`);
    const child = session.child_id ? await repo.getChild(session.child_id, parent.id) : null;
    return { session, parent, child, siteUrl, parentName: parent.full_name, childName: child?.first_name ?? null };
  }

  async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      console.error(`[booking] ${label} failed:`, e);
    }
  }

  // ───────────────────────── Slots ─────────────────────────
  async function slots(input: SlotsInput): Promise<Record<string, Slot[]>> {
    const settings = await repo.getSettings();
    const from = new Date(Date.parse(input.fromDate) - 2 * 86_400_000).toISOString();
    const to = new Date(Date.parse(input.toDate) + 3 * 86_400_000).toISOString();
    const [busy, blocked] = await Promise.all([repo.listActive(from, to), repo.listBlocked(from, to)]);
    return availableSlots({
      kind: input.kind,
      fromDate: input.fromDate,
      toDate: input.toDate,
      parentTz: input.parentTz,
      busy: busy.map((b) => ({ starts_at: b.starts_at, block_until: b.block_until, seat: b.seat })),
      blocked,
      now: now(),
      bookingsPaused: settings.bookings_paused,
    });
  }

  // ───────────────────────── Hold + checkout ─────────────────────────
  async function hold(input: HoldInput): Promise<{ sessionId: string; checkoutUrl: string }> {
    if (!input.adultGuardian || !input.consent.accepted) throw new BookingError("INVALID");
    if (input.kind === "trial" && !S.freeTrialEnabled) throw new BookingError("TRIAL_DISABLED");
    if (!(S.grades as readonly number[]).includes(input.child.grade)) throw new BookingError("INVALID");
    const firstName = input.child.firstName.trim();
    if (firstName.length < 1 || firstName.length > 40) throw new BookingError("INVALID");

    const startsAt = new Date(input.startsAt);
    const bad = validateStart(startsAt, input.kind, now());
    if (bad) throw new BookingError(bad);

    const parent = await repo.getParent(input.parentId);
    if (!parent) throw new BookingError("FORBIDDEN");

    // Fast pre-check so a family that already had its trial never reaches Stripe.
    if (input.kind === "trial") {
      const claim = await repo.findTrialClaim({
        emailHash: hashEmail(parent.email),
        phoneHash: input.phone ? hashPhone(input.phone) : parent.phone ? hashPhone(parent.phone) : null,
      });
      if (claim) throw new BookingError("TRIAL_USED");
    }

    await repo.updateParent(parent.id, {
      full_name: input.fullName?.trim() || parent.full_name,
      phone: input.phone?.trim() || parent.phone,
      timezone: input.parentTz,
      adult_guardian_confirmed_at: parent.adult_guardian_confirmed_at ?? now().toISOString(),
    });

    let child: ChildRow | null = null;
    if (input.child.id) child = await repo.getChild(input.child.id, parent.id);
    if (!child) child = await repo.createChild(parent.id, firstName, input.child.grade);

    const session = await repo.bookSlot({
      parentId: parent.id,
      childId: child.id,
      kind: input.kind,
      startsAt: startsAt.toISOString(),
      minutes: sessionMinutes(input.kind),
      bufferMinutes: S.bufferMinutes,
      maxSeats: S.maxSimultaneous,
      holdMinutes: S.holdMinutes,
      topic: input.topic.trim().slice(0, 120) || null,
      priceCents: sessionPriceCents(input.kind),
      parentTimezone: input.parentTz,
    });

    await repo.insertConsent({
      parent_id: parent.id,
      session_id: session.id,
      policy_version: input.consent.policyVersion,
      ip_hash: input.consent.ipHash,
      user_agent: input.consent.userAgent,
    });

    try {
      const customerId = await payments.ensureCustomer({
        id: parent.id,
        email: parent.email,
        name: input.fullName ?? parent.full_name,
        existingId: parent.stripe_customer_id,
      });
      if (customerId !== parent.stripe_customer_id) await repo.updateParent(parent.id, { stripe_customer_id: customerId });

      const checkout = await payments.createCheckout({
        sessionId: session.id,
        kind: input.kind,
        customerId,
        amountCents: session.price_cents,
        currency: session.currency,
        productName: input.kind === "trial" ? `Free ${S.trialMinutes}-minute trial` : `${S.paidMinutes}-minute math session`,
        description: `${firstName} · grade ${input.child.grade}${input.topic ? ` · ${input.topic.trim()}` : ""}`,
        successUrl: `${siteUrl}/book/done?session=${session.id}`,
        cancelUrl: `${siteUrl}/book?cancelled=${session.id}`,
      });
      await repo.updateSession(session.id, { stripe_checkout_id: checkout.id });
      return { sessionId: session.id, checkoutUrl: checkout.url };
    } catch (e) {
      // Don't leave a dangling hold if Stripe is down.
      await safe("release hold after checkout failure", () => repo.updateSession(session.id, { status: "expired" }));
      throw e;
    }
  }

  // ───────────────────────── Stripe webhook ─────────────────────────
  async function handleStripeEvent(event: StripeEventLike): Promise<{ handled: boolean; duplicate?: boolean; note?: string }> {
    const fresh = await repo.claimStripeEvent(event.id, event.type);
    if (!fresh) return { handled: true, duplicate: true };
    const obj = event.data.object;

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return onCheckoutCompleted(obj);
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        return onCheckoutFailed(obj, event.type);
      case "payment_intent.payment_failed": {
        const sessionId = str((obj.metadata as Record<string, unknown> | undefined)?.session_id);
        const s = sessionId ? await repo.getSession(sessionId) : null;
        await repo.insertPaymentFailure({
          parent_id: s?.parent_id ?? null,
          session_id: s?.id ?? null,
          stripe_object_id: str(obj.id),
          reason: str((obj.last_payment_error as Record<string, unknown> | undefined)?.message) ?? "payment_failed",
        });
        return { handled: true };
      }
      case "charge.refunded": {
        const pi = str(obj.payment_intent);
        if (!pi) return { handled: true, note: "no payment_intent" };
        return { handled: true, note: `refund recorded for ${pi}` };
      }
      case "charge.dispute.created": {
        await safe("dispute alert", () => alerts.alertOwner(`Panther: a card dispute was opened (${str(obj.id)}). Check Stripe.`));
        return { handled: true };
      }
      default:
        return { handled: false };
    }
  }

  async function onCheckoutCompleted(cs: Record<string, unknown>) {
    const meta = (cs.metadata ?? {}) as Record<string, unknown>;
    const sessionId = str(meta.session_id) ?? str(cs.client_reference_id);
    const checkoutId = str(cs.id);
    let session = sessionId ? await repo.getSession(sessionId) : checkoutId ? await repo.getSessionByCheckout(checkoutId) : null;
    if (!session) {
      await safe("orphan checkout alert", () => alerts.alertOwner(`Panther: Stripe checkout ${checkoutId} completed but no session matched.`));
      return { handled: true, note: "no session" };
    }

    const paymentIntent = str(cs.payment_intent);
    const setupIntent = str(cs.setup_intent);
    const mode = str(cs.mode);

    if (session.status === "confirmed" || session.status === "completed") return { handled: true, note: "already confirmed" };

    if (session.status === "cancelled") {
      if (paymentIntent) await refundSession(session, paymentIntent, "cancelled before payment landed");
      return { handled: true, note: "cancelled" };
    }

    if (mode === "payment" && cs.payment_status !== "paid") return { handled: true, note: `payment_status=${String(cs.payment_status)}` };

    // Hold lapsed while the parent was paying: try to take the time again.
    if (session.status === "expired") {
      try {
        session = await repo.reviveHold(session.id, S.bufferMinutes, S.maxSimultaneous, S.holdMinutes);
      } catch (e) {
        if (!(e instanceof BookingError)) throw e;
        if (paymentIntent) await refundSession(session, paymentIntent, `slot gone after late payment (${e.code})`);
        else await repo.updateSession(session.id, { status: "cancelled", cancelled_at: now().toISOString(), cancel_reason: `slot gone (${e.code})` });
        const c = await ctx(session);
        await safe("late payment email", () => email.send({ to: c.parent.email, ...mail.latePaymentRefundedEmail(c) }));
        return { handled: true, note: `late payment, ${e.code}` };
      }
    }

    // One free trial per family — checked again here, with the card fingerprint.
    if (session.kind === "trial") {
      const parent = await repo.getParent(session.parent_id);
      if (!parent) throw new Error("parent missing");
      const fingerprint = setupIntent ? await payments.cardFingerprintForSetupIntent(setupIntent) : null;
      const emailHash = hashEmail(parent.email);
      const phoneHash = parent.phone ? hashPhone(parent.phone) : null;
      const existing = await repo.findTrialClaim({ emailHash, cardFingerprint: fingerprint, phoneHash });
      const result =
        existing && existing.session_id !== session.id
          ? "conflict"
          : existing
            ? "ok"
            : await repo.insertTrialClaim({
                email_hash: emailHash,
                card_fingerprint: fingerprint,
                phone_hash: phoneHash,
                parent_id: parent.id,
                session_id: session.id,
              });
      if (result === "conflict") {
        await repo.updateSession(session.id, {
          status: "cancelled",
          cancelled_at: now().toISOString(),
          cancel_reason: "trial_already_used",
          stripe_setup_intent: setupIntent,
        });
        await safe("trial used email", () =>
          email.send({ to: parent.email, ...mail.trialAlreadyUsedEmail({ to: parent.email, parentName: parent.full_name, childName: null, siteUrl }) }),
        );
        return { handled: true, note: "trial already used" };
      }
    }

    session = await repo.updateSession(session.id, {
      status: "confirmed",
      hold_expires_at: null,
      stripe_checkout_id: session.stripe_checkout_id ?? checkoutId,
      stripe_payment_intent: paymentIntent ?? session.stripe_payment_intent,
      stripe_setup_intent: setupIntent ?? session.stripe_setup_intent,
      paid_at: mode === "payment" ? now().toISOString() : session.paid_at,
    });

    await safe("fulfill after confirm", () => fulfill(session!.id));
    return { handled: true, note: "confirmed" };
  }

  async function onCheckoutFailed(cs: Record<string, unknown>, type: string) {
    const meta = (cs.metadata ?? {}) as Record<string, unknown>;
    const sessionId = str(meta.session_id) ?? str(cs.client_reference_id);
    const session = sessionId ? await repo.getSession(sessionId) : null;
    if (!session) return { handled: true, note: "no session" };
    if (session.status === "held") {
      await repo.updateSession(session.id, { status: "expired" });
    }
    if (type === "checkout.session.async_payment_failed") {
      await repo.insertPaymentFailure({ parent_id: session.parent_id, session_id: session.id, stripe_object_id: str(cs.id), reason: type });
    }
    return { handled: true, note: "hold released" };
  }

  async function refundSession(session: SessionRow, paymentIntent: string, reason: string): Promise<SessionRow> {
    if (session.stripe_refund_id) return session;
    const r = await payments.refund(paymentIntent);
    return repo.updateSession(session.id, {
      status: "cancelled",
      cancelled_at: session.cancelled_at ?? now().toISOString(),
      cancel_reason: session.cancel_reason ?? reason,
      stripe_payment_intent: paymentIntent,
      stripe_refund_id: r.id,
      refunded_at: now().toISOString(),
    });
  }

  // ───────────────────────── Fulfillment ─────────────────────────
  /**
   * Meet link → calendar invite → confirmation email → tutor bot. Each step
   * is skipped when already done, so this can run again after any failure.
   */
  async function fulfill(sessionId: string): Promise<SessionRow> {
    let session = await repo.getSession(sessionId);
    if (!session) throw new BookingError("NOT_FOUND");
    if (session.status !== "confirmed") return session;
    const c = await ctx(session);
    const hadError = !!session.fulfillment_error;

    try {
      if (!session.meet_url) {
        const kid = c.childName ?? "your child";
        const m = await meetings.createMeeting({
          sessionId: session.id,
          title: `${config.brand.name}: ${kid}'s math session`,
          description: `${config.brand.tutorLabel.replace(/^your /, "Your ")} will join this Google Meet${session.topic ? ` to work on ${session.topic}` : ""}. ${config.tutoring.assistantName} (our note-taking assistant) joins too and never records. Upload notes or homework: ${siteUrl}/dashboard/s/${session.id}`,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          parentEmail: c.parent.email,
          parentTz: session.parent_timezone,
        });
        session = await repo.updateSession(session.id, { meet_url: m.meetUrl, meet_space: m.meetSpace, calendar_event_id: m.calendarEventId });
      }

      if (!session.confirmation_sent_at) {
        await email.send({ to: c.parent.email, ...mail.confirmationEmail({ ...c, session }) });
        session = await repo.updateSession(session.id, { confirmation_sent_at: now().toISOString() });
      }

      if (!session.recall_bot_id && session.meet_url) {
        const joinAt = new Date(Date.parse(session.starts_at) - S.tutorJoinLeadMinutes * 60_000).toISOString();
        const b = await bot.schedule({ sessionId: session.id, meetUrl: session.meet_url, joinAt });
        session = await repo.updateSession(session.id, { recall_bot_id: b.botId, bot_status: "scheduled", bot_status_at: now().toISOString() });
      }

      session = await repo.updateSession(session.id, { fulfilled_at: now().toISOString(), fulfillment_error: null });
      return session;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      session = await repo.updateSession(session.id, { fulfillment_error: message.slice(0, 500) });
      if (!hadError) {
        await safe("fulfillment alert", () => alerts.alertOwner(`Panther: fulfillment failed for session ${session!.id.slice(0, 8)} (${message.slice(0, 120)}). Retrying every 5 min.`));
      }
      throw e;
    }
  }

  // ───────────────────────── Cancel ─────────────────────────
  async function cancel(input: { sessionId: string; parentId: string | null; reason?: string }): Promise<{ session: SessionRow; refunded: boolean }> {
    let session = await repo.getSession(input.sessionId);
    if (!session) throw new BookingError("NOT_FOUND");
    if (input.parentId && session.parent_id !== input.parentId) throw new BookingError("FORBIDDEN");
    if (session.status !== "held" && session.status !== "confirmed") throw new BookingError("NOT_ACTIVE");

    const byAdmin = input.parentId === null;
    const hours = hoursUntil(session.starts_at, now());
    const refundable = session.kind === "paid" && !!session.stripe_payment_intent && !session.stripe_refund_id && (byAdmin || hours >= S.freeCancelHours);

    session = await repo.updateSession(session.id, {
      status: session.status === "held" ? "expired" : "cancelled",
      cancelled_at: now().toISOString(),
      cancel_reason: input.reason ?? (byAdmin ? "cancelled_by_admin" : "cancelled_by_parent"),
    });
    if (session.status === "expired") return { session, refunded: false };

    let refunded = false;
    if (refundable) {
      try {
        session = await refundSession(session, session.stripe_payment_intent!, session.cancel_reason ?? "cancelled");
        refunded = true;
      } catch (e) {
        console.error("[booking] refund failed:", e);
        await safe("refund alert", () => alerts.alertOwner(`Panther: automatic refund failed for session ${session!.id.slice(0, 8)}. Refund manually in Stripe.`));
      }
    }

    if (session.recall_bot_id) {
      await safe("cancel bot", async () => {
        await bot.cancel(session!.recall_bot_id!);
        session = await repo.updateSession(session!.id, { bot_status: "cancelled", bot_status_at: now().toISOString() });
      });
    }
    await safe("delete calendar event", () => meetings.deleteMeeting(session!.calendar_event_id));

    const c = await ctx(session);
    await safe("cancel email", () => email.send({ to: c.parent.email, ...mail.cancelledEmail(c, refunded) }));
    return { session, refunded };
  }

  // ───────────────────────── Reschedule ─────────────────────────
  async function reschedule(input: { sessionId: string; parentId: string | null; startsAt: string }): Promise<SessionRow> {
    let session = await repo.getSession(input.sessionId);
    if (!session) throw new BookingError("NOT_FOUND");
    if (input.parentId && session.parent_id !== input.parentId) throw new BookingError("FORBIDDEN");
    if (session.status !== "confirmed") throw new BookingError("NOT_ACTIVE");
    if (input.parentId !== null && hoursUntil(session.starts_at, now()) < S.freeCancelHours) throw new BookingError("TOO_LATE");

    const target = new Date(input.startsAt);
    const bad = validateStart(target, session.kind, now());
    if (bad) throw new BookingError(bad);

    const previous = session.starts_at;
    session = await repo.moveSession(session.id, target.toISOString(), S.bufferMinutes, S.maxSimultaneous);

    if (session.calendar_event_id) {
      await safe("update calendar event", () => meetings.updateMeetingTime(session!.calendar_event_id!, session!.starts_at, session!.ends_at));
    }
    if (session.recall_bot_id && session.meet_url) {
      await safe("reschedule bot", async () => {
        await bot.cancel(session!.recall_bot_id!);
        const joinAt = new Date(Date.parse(session!.starts_at) - S.tutorJoinLeadMinutes * 60_000).toISOString();
        const b = await bot.schedule({ sessionId: session!.id, meetUrl: session!.meet_url!, joinAt });
        session = await repo.updateSession(session!.id, { recall_bot_id: b.botId, bot_status: "scheduled", bot_status_at: now().toISOString() });
      });
    }
    const c = await ctx(session);
    await safe("reschedule email", () => email.send({ to: c.parent.email, ...mail.rescheduledEmail(c, previous) }));
    return session;
  }

  // ───────────────────────── Cron tick ─────────────────────────
  async function tick(): Promise<{ expired: number; completed: number; reminders: number; fulfilled: number; errors: number }> {
    const t = now();
    const out = { expired: 0, completed: 0, reminders: 0, fulfilled: 0, errors: 0 };

    out.expired = await repo.expireStaleHolds();
    out.completed = await repo.markCompleted(t.toISOString());

    const horizon = new Date(t.getTime() + Math.max(...S.reminderHours) * 3_600_000 + 60_000).toISOString();
    const upcoming = await repo.listConfirmedStartingBetween(t.toISOString(), horizon);
    for (const s of upcoming) {
      const hours = hoursUntil(s.starts_at, t);
      const want24 = S.reminderHours.includes(24) && !s.reminder_24h_sent_at && hours <= 24 && hours > 3;
      const want1 = S.reminderHours.includes(1) && !s.reminder_1h_sent_at && hours <= 1;
      if (!want24 && !want1) continue;
      try {
        const c = await ctx(s);
        if (want1) {
          await email.send({ to: c.parent.email, ...mail.reminderEmail(c, 1) });
          await repo.updateSession(s.id, { reminder_1h_sent_at: t.toISOString(), reminder_24h_sent_at: s.reminder_24h_sent_at ?? t.toISOString() });
        } else {
          await email.send({ to: c.parent.email, ...mail.reminderEmail(c, 24) });
          await repo.updateSession(s.id, { reminder_24h_sent_at: t.toISOString() });
        }
        out.reminders++;
      } catch (e) {
        out.errors++;
        console.error("[cron] reminder failed:", s.id, e);
      }
    }

    const pending = (await repo.listUnfulfilled()).slice(0, 10);
    for (const s of pending) {
      try {
        await fulfill(s.id);
        out.fulfilled++;
      } catch {
        out.errors++;
      }
    }
    return out;
  }

  return { slots, hold, handleStripeEvent, fulfill, cancel, reschedule, tick };
}

export type BookingService = ReturnType<typeof createBookingService>;
