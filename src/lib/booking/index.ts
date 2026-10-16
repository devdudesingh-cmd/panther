import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripeProvider } from "@/lib/providers/stripe";
import { googleProvider } from "@/lib/providers/google";
import { resendProvider } from "@/lib/providers/email";
import { recallProvider } from "@/lib/providers/recall";
import { twilioProvider } from "@/lib/providers/sms";
import { supabaseRepo } from "./repo";
import { createBookingService, type BookingService } from "./service";

let cached: BookingService | null = null;

/** The production booking service, wired to the real providers. */
export function bookingService(): BookingService {
  if (cached) return cached;
  cached = createBookingService({
    repo: supabaseRepo(supabaseAdmin()),
    payments: stripeProvider(),
    meetings: googleProvider(),
    email: resendProvider(),
    bot: recallProvider(),
    alerts: twilioProvider(),
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  });
  return cached;
}

export { BookingError } from "@/lib/errors";
export type { BookingService } from "./service";
