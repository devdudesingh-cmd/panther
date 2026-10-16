import type { Metadata } from "next";
import { Suspense } from "react";
import DoneClient from "./DoneClient";

export const metadata: Metadata = {
  title: "Confirming your booking",
  robots: { index: false },
};

/**
 * Post-checkout page. It only *watches* the booking; confirmation happens in
 * the Stripe webhook. Nothing here can mark a session as paid.
 */
export default function DonePage() {
  return (
    <main id="main" className="wrap flex-1 py-16 md:py-24">
      <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
        <DoneClient />
      </Suspense>
    </main>
  );
}
