import { config, formatPrice } from "@/config";

// Phase 1 placeholder — replaced by the full marketing site in Phase 4.
export default function HomePage() {
  return (
    <main id="main" className="wrap flex-1 py-24">
      <p className="eyebrow">Panther</p>
      <h1 className="text-display-lg mt-4">{config.brand.tagline}</h1>
      <p className="mt-6 max-w-prose text-ink-soft">
        First {config.sessions.trialMinutes}-minute session free. Then {formatPrice(config.pricing.paidSessionCents)} per{" "}
        {config.sessions.paidMinutes}-minute session.
      </p>
      <div className="mt-8 flex gap-3">
        <a className="btn btn-primary" href="/book">
          Book a free trial
        </a>
        <a className="btn btn-ghost" href="/pricing">
          Pricing
        </a>
      </div>
    </main>
  );
}
