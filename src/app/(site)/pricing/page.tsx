import type { Metadata } from "next";
import Link from "next/link";
import { config, formatPrice } from "@/config";
import Pricing from "@/components/home/Pricing";
import { PageHeader } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "Pricing",
  description: `One free ${config.sessions.trialMinutes}-minute trial per family, then ${formatPrice(config.pricing.paidSessionCents)} per ${config.sessions.paidMinutes}-minute session. No subscriptions.`,
};

const faqs = [
  {
    q: "Is the free trial really free?",
    a: `Yes. We ask for a card so each family gets one trial, but nothing is charged — your statement will show a $0 authorization at most. You can book a paid session afterwards or not; there's no automatic renewal.`,
  },
  {
    q: "What happens if we need to cancel?",
    a: `Cancel or reschedule from your dashboard. Up to ${config.sessions.freeCancelHours} hours before the session it's free and any payment is refunded automatically to the same card (usually 5–10 business days). Inside ${config.sessions.freeCancelHours} hours the session isn't refundable, but email us if something unexpected came up.`,
  },
  {
    q: "What if my kid has a rough day and we stop early?",
    a: "It happens. The session still counts, but the tutor will have made notes and your recap will say what to try next. If something went wrong on our side, we'll make it right — just reply to the recap email.",
  },
  {
    q: "Do you sell packs or subscriptions?",
    a: `Not yet. Every session is ${formatPrice(config.pricing.paidSessionCents)}, booked one at a time, so you're never paying for sessions you don't use.`,
  },
  {
    q: "Which grades and topics?",
    a: `Grades ${config.sessions.grades[0]}–${config.sessions.grades.at(-1)} to start, covering ${config.sessions.topics.slice(0, 5).join(", ").toLowerCase()} and more. Tell us the topic when you book, or just upload the homework.`,
  },
  {
    q: "How do I pay?",
    a: "By card, through Stripe. We never see or store your card number.",
  },
];

export default function PricingPage() {
  return (
    <main id="main" className="flex-1">
      <PageHeader
        eyebrow="Pricing"
        title={
          <>
            Simple: try it free, then <span className="text-red">{formatPrice(config.pricing.paidSessionCents)}</span> a session.
          </>
        }
        lede="No subscriptions, no packs, no surprise fees. Book one session at a time and stop whenever you like."
      />
      <Pricing compact />

      <section className="wrap py-12 md:py-20" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-display-md" data-reveal>
          Questions parents ask
        </h2>
        <dl className="mt-8 grid gap-4 md:grid-cols-2" data-reveal-stagger>
          {faqs.map((f) => (
            <div key={f.q} className="rounded-3xl border-2 border-ink bg-white p-6">
              <dt className="display text-lg font-extrabold tracking-tight">{f.q}</dt>
              <dd className="mt-2 text-ink-soft">{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-ink-soft">
          Something else?{" "}
          <a className="font-semibold text-red underline-offset-4 hover:underline" href={`mailto:${config.brand.supportEmail}`}>
            {config.brand.supportEmail}
          </a>{" "}
          — or just{" "}
          <Link href="/book" className="font-semibold text-red underline-offset-4 hover:underline">
            book the free trial
          </Link>{" "}
          and see for yourself.
        </p>
      </section>
    </main>
  );
}
