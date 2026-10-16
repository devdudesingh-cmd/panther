import type { Metadata } from "next";
import Link from "next/link";
import { config, formatPrice } from "@/config";
import { PageHeader, Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Panther's terms of service.",
};

export default function TermsPage() {
  return (
    <main id="main" className="flex-1">
      <PageHeader eyebrow="Terms" title="Terms of service" lede={`Effective ${config.legal.effectiveDate}`} />
      <Prose>
        <p>
          These terms are an agreement between you and {config.legal.entityName} (&ldquo;{config.brand.name}&rdquo;). By creating an
          account or booking a session you agree to them. We&apos;ve kept them short and readable on purpose.
        </p>

        <h2>1. Who can use Panther</h2>
        <p>
          Accounts are for adults ({config.legal.minParentAge}+) who are the parent or legal guardian of the child they book for. You
          confirm this when you book. Children use the Service only through a parent&apos;s account and with the parent&apos;s
          consent.
        </p>

        <h2>2. What we provide</h2>
        <p>
          Live, one-on-one math tutoring for grades {config.sessions.grades[0]}–{config.sessions.grades.at(-1)} over Google Meet,
          plus a written recap and practice problems after each session. Sessions are led by Panther tutors — {config.tutoring.tutorKinds} —
          with a software assistant on the call that writes the recap, as described on our <Link href="/safety">safety page</Link>.
          Tutoring supports learning; it isn&apos;t a substitute for school instruction or for professional educational assessment.
        </p>

        <h2>3. Booking, prices and payment</h2>
        <ul>
          <li>
            Prices are shown before you pay. Currently {formatPrice(config.pricing.paidSessionCents)} per {config.sessions.paidMinutes}
            -minute session.
          </li>
          <li>
            One free {config.sessions.trialMinutes}-minute trial per family. We may require a card to reserve it; nothing is charged for
            the trial. Attempting to obtain more than one trial (for example with different email addresses) may lead to cancellation
            of bookings.
          </li>
          <li>Payments are processed by Stripe under Stripe&apos;s terms. A booking is confirmed only when payment succeeds.</li>
          <li>A slot is held for 10 minutes while you check out. If payment arrives later and the slot is gone, we refund automatically.</li>
        </ul>

        <h2>4. Rescheduling, cancellation and refunds</h2>
        <ul>
          <li>
            Reschedule or cancel for free from your dashboard up to {config.sessions.freeCancelHours} hours before the start. Paid
            sessions cancelled in that window are refunded in full to the original card.
          </li>
          <li>Inside {config.sessions.freeCancelHours} hours, sessions can be cancelled but are not refundable, and cannot be rescheduled online. Email us if something unexpected happens — we&apos;re reasonable people.</li>
          <li>If we cancel a session or it can&apos;t take place because of a problem on our side, you get a full refund or a free rebooking, your choice.</li>
        </ul>

        <h2>5. Your responsibilities</h2>
        <ul>
          <li>Keep your login secure; magic links and codes are for you only.</li>
          <li>Be present or nearby during your child&apos;s session, as you would for any online activity.</li>
          <li>Upload only material you have the right to share, and avoid photos showing your child&apos;s face or full name.</li>
          <li>Don&apos;t misuse the Service: no attempts to interfere with it, scrape it, or use it for anything other than your own child&apos;s tutoring.</li>
        </ul>

        <h2>6. Privacy</h2>
        <p>
          Our <Link href="/privacy">privacy policy</Link> and <Link href="/parent-notice">parent notice</Link> explain what we collect
          and why. They&apos;re part of these terms.
        </p>

        <h2>7. Intellectual property</h2>
        <p>
          The Service, including its content, design and software, belongs to us or our licensors. Recaps and practice problems we
          produce for your child are yours to use for your family&apos;s learning.
        </p>

        <h2>8. Disclaimers and liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo;. We don&apos;t guarantee particular learning outcomes or uninterrupted
          availability (Google Meet and the internet are outside our control). To the fullest extent the law allows, our total
          liability to you for any claim related to the Service is limited to the amount you paid us in the 12 months before the
          claim. Nothing here limits liability that can&apos;t be limited by law.
        </p>

        <h2>9. Ending the agreement</h2>
        <p>
          You can stop using Panther and delete your data at any time. We may suspend or close accounts that break these terms or
          put a child&apos;s safety at risk; any prepaid, undelivered sessions are refunded.
        </p>

        <h2>10. Changes and governing law</h2>
        <p>
          We may update these terms; material changes will be announced by email before they take effect. These terms are governed
          by the laws of {config.legal.governingLaw}, without regard to conflict-of-law rules.
        </p>

        <h2>11. Contact</h2>
        <p>
          {config.legal.entityName} · <a href={`mailto:${config.brand.supportEmail}`}>{config.brand.supportEmail}</a>
        </p>
      </Prose>
    </main>
  );
}
