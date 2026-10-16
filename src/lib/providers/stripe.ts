import Stripe from "stripe";
import { env } from "@/lib/env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(env("stripe").STRIPE_SECRET_KEY, { typescript: true });
  return cached;
}

export interface CheckoutInput {
  sessionId: string;
  kind: "trial" | "paid";
  customerId: string;
  amountCents: number;
  currency: string;
  productName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Payments provider port. The booking code talks to this interface so tests
 * can swap in a fake; `stripeProvider()` is the real one.
 */
export interface PaymentsProvider {
  ensureCustomer(parent: { id: string; email: string; name: string | null; existingId: string | null }): Promise<string>;
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  expireCheckout(checkoutId: string): Promise<void>;
  /** Card fingerprint for the payment method saved by a setup-mode Checkout. */
  cardFingerprintForSetupIntent(setupIntentId: string): Promise<string | null>;
  /** Card fingerprint for a completed payment. */
  cardFingerprintForPaymentIntent(paymentIntentId: string): Promise<string | null>;
  refund(paymentIntentId: string, reason?: "requested_by_customer" | "duplicate"): Promise<{ id: string }>;
}

export function stripeProvider(): PaymentsProvider {
  return {
    async ensureCustomer(parent) {
      if (parent.existingId) return parent.existingId;
      const c = await stripe().customers.create({
        email: parent.email,
        name: parent.name ?? undefined,
        metadata: { parent_id: parent.id },
      });
      return c.id;
    },

    async createCheckout(input) {
      const common: Stripe.Checkout.SessionCreateParams = {
        customer: input.customerId,
        client_reference_id: input.sessionId,
        metadata: { session_id: input.sessionId, kind: input.kind },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        // Stripe's minimum is 30 min. Our DB hold is 10 min; the webhook deals with late payments.
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      };
      const s =
        input.kind === "trial"
          ? await stripe().checkout.sessions.create({
              ...common,
              mode: "setup",
              setup_intent_data: { metadata: { session_id: input.sessionId, kind: "trial" } },
              custom_text: {
                submit: { message: "Your card is only used to confirm one free trial per family. Nothing is charged." },
              },
            })
          : await stripe().checkout.sessions.create({
              ...common,
              mode: "payment",
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: input.currency,
                    unit_amount: input.amountCents,
                    product_data: { name: input.productName, description: input.description },
                  },
                },
              ],
              payment_intent_data: { metadata: { session_id: input.sessionId, kind: "paid" } },
            });
      if (!s.url) throw new Error("Stripe did not return a Checkout URL");
      return { id: s.id, url: s.url };
    },

    async expireCheckout(checkoutId) {
      try {
        await stripe().checkout.sessions.expire(checkoutId);
      } catch (e) {
        // Already completed/expired is fine.
        if (!(e instanceof Stripe.errors.StripeError && e.statusCode === 400)) throw e;
      }
    },

    async cardFingerprintForSetupIntent(setupIntentId) {
      const si = await stripe().setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
      const pm = si.payment_method;
      return pm && typeof pm !== "string" ? (pm.card?.fingerprint ?? null) : null;
    },

    async cardFingerprintForPaymentIntent(paymentIntentId) {
      const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
      const pm = pi.payment_method;
      return pm && typeof pm !== "string" ? (pm.card?.fingerprint ?? null) : null;
    },

    async refund(paymentIntentId, reason = "requested_by_customer") {
      const r = await stripe().refunds.create({ payment_intent: paymentIntentId, reason });
      return { id: r.id };
    },
  };
}

/** Verify and parse a webhook payload. Throws on a bad signature. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, env("stripe").STRIPE_WEBHOOK_SECRET);
}
