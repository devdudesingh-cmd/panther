import Link from "next/link";
import { config, formatPrice } from "@/config";
import CountUp from "./CountUp";

export default function Pricing({ compact = false }: { compact?: boolean }) {
  const price = config.pricing.paidSessionCents;
  return (
    <section id="pricing" className="wrap scroll-mt-24 py-24 md:py-32" aria-labelledby="pricing-title">
      {!compact && (
        <div className="max-w-2xl" data-reveal>
          <p className="eyebrow">Pricing</p>
          <h2 id="pricing-title" className="text-display-lg mt-4">
            Try it free. Then pay per&nbsp;session.
          </h2>
          <p className="mt-5 text-lg text-ink-soft">No subscriptions, no packs, no surprises. Book one at a time.</p>
        </div>
      )}
      <div className="mt-12 grid gap-6 md:grid-cols-2" data-reveal-stagger>
        {config.sessions.freeTrialEnabled && (
          <div className="card flex flex-col p-8 sm:p-10">
            <p className="eyebrow">Free trial</p>
            <div className="display mt-4 flex items-end gap-2 text-6xl font-extrabold tracking-tighter">
              $0<span className="mb-2 text-lg font-bold tracking-normal text-ink-soft">/ {config.sessions.trialMinutes} min</span>
            </div>
            <ul className="mt-6 space-y-2.5 text-ink-soft">
              <li>✓ One per family</li>
              <li>✓ Real session, real recap</li>
              <li>✓ Card on file, nothing charged</li>
            </ul>
            <Link href="/book?kind=trial" className="btn btn-ghost mt-8 min-h-13">
              Book the free trial
            </Link>
          </div>
        )}
        <div className="card flex flex-col bg-red p-8 text-white sm:p-10">
          <p className="eyebrow text-white">Per session</p>
          <div className="display mt-4 flex items-end gap-2 text-6xl font-extrabold tracking-tighter">
            <CountUp to={price / 100} prefix="$" />
            <span className="mb-2 text-lg font-bold tracking-normal text-white">/ {config.sessions.paidMinutes} min</span>
          </div>
          <ul className="mt-6 space-y-2.5 text-white">
            <li>✓ One-on-one on Google Meet</li>
            <li>✓ Upload homework beforehand</li>
            <li>✓ Recap + practice problems after</li>
            <li>✓ Free reschedule or refund up to {config.sessions.freeCancelHours}h before</li>
          </ul>
          <Link href="/book?kind=paid" className="btn btn-ghost mt-8 min-h-13">
            Book a {formatPrice(price)} session
          </Link>
        </div>
      </div>
    </section>
  );
}
