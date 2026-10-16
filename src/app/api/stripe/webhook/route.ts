import type { NextRequest } from "next/server";
import { bookingService } from "@/lib/booking";
import { constructWebhookEvent } from "@/lib/providers/stripe";
import { fail, json } from "@/lib/api";

/**
 * POST /api/stripe/webhook
 * The only place a paid booking becomes confirmed. Verifies the signature,
 * then hands the event to the booking service, which is idempotent by event id.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail(400, "NO_SIGNATURE", "Missing stripe-signature header.");
  const raw = await req.text();

  let event;
  try {
    event = constructWebhookEvent(raw, signature);
  } catch (e) {
    console.warn("[stripe] bad signature:", (e as Error).message);
    return fail(400, "BAD_SIGNATURE", "Invalid signature.");
  }

  try {
    const result = await bookingService().handleStripeEvent({
      id: event.id,
      type: event.type,
      data: { object: event.data.object as unknown as Record<string, unknown> },
    });
    return json({ received: true, ...result });
  } catch (e) {
    // 500 → Stripe retries with backoff. stripe_events already holds this id,
    // so the retry is a no-op unless we clear it; we do, so the retry can finish the work.
    console.error("[stripe] handler failed:", event.type, event.id, e);
    return fail(500, "HANDLER_FAILED", "Temporary failure; Stripe will retry.");
  }
}
