import type { PaymentsProvider } from "@/lib/providers/stripe";
import type { MeetingProvider } from "@/lib/providers/google";
import type { EmailProvider, EmailMessage } from "@/lib/providers/email";
import type { TutorBotProvider } from "@/lib/providers/recall";
import type { AlertProvider } from "@/lib/providers/sms";

/** In-memory fakes for every external provider, with call logs for assertions. */
export function fakeProviders(opts: { fingerprint?: string | null; failMeeting?: boolean } = {}) {
  const log = {
    checkouts: [] as { sessionId: string; kind: string; amountCents: number }[],
    refunds: [] as string[],
    emails: [] as EmailMessage[],
    bots: [] as { botId: string; sessionId: string; joinAt: string; meetUrl: string }[],
    cancelledBots: [] as string[],
    deletedEvents: [] as string[],
    updatedEvents: [] as { eventId: string; startsAt: string }[],
    alerts: [] as string[],
    meetings: 0,
  };
  let n = 0;
  const state = { failMeeting: !!opts.failMeeting, fingerprint: opts.fingerprint === undefined ? "fp_default" : opts.fingerprint };

  const payments: PaymentsProvider = {
    async ensureCustomer(p) {
      return p.existingId ?? `cus_${p.id.slice(0, 8)}`;
    },
    async createCheckout(i) {
      log.checkouts.push({ sessionId: i.sessionId, kind: i.kind, amountCents: i.amountCents });
      const id = `cs_test_${++n}`;
      return { id, url: `https://checkout.stripe.test/${id}` };
    },
    async expireCheckout() {},
    async cardFingerprintForSetupIntent() {
      return state.fingerprint;
    },
    async cardFingerprintForPaymentIntent() {
      return state.fingerprint;
    },
    async refund(pi) {
      log.refunds.push(pi);
      return { id: `re_${++n}` };
    },
  };

  const meetings: MeetingProvider = {
    async createMeeting(i) {
      if (state.failMeeting) throw new Error("Google is down");
      log.meetings++;
      return { meetUrl: `https://meet.google.com/fake-${i.sessionId.slice(0, 4)}`, meetSpace: `spaces/${i.sessionId.slice(0, 4)}`, calendarEventId: `evt_${i.sessionId.slice(0, 4)}` };
    },
    async updateMeetingTime(eventId, startsAt) {
      log.updatedEvents.push({ eventId, startsAt });
    },
    async deleteMeeting(eventId) {
      if (eventId) log.deletedEvents.push(eventId);
    },
  };

  const email: EmailProvider = {
    async send(m) {
      log.emails.push(m);
    },
  };

  const bot: TutorBotProvider = {
    async schedule(i) {
      const botId = `bot_${++n}`;
      log.bots.push({ botId, ...i });
      return { botId };
    },
    async cancel(botId) {
      log.cancelledBots.push(botId);
    },
    async deleteMedia() {},
  };

  const alerts: AlertProvider = {
    async alertOwner(m) {
      log.alerts.push(m);
    },
  };

  return { payments, meetings, email, bot, alerts, log, state };
}
