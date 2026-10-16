import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/config";
import { PageHeader, Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "Safety & privacy",
  description: "How Panther keeps kids safe and families' data private: parent-only accounts, minimal data, no recordings, no trackers.",
};

export default function SafetyPage() {
  return (
    <main id="main" className="flex-1">
      <PageHeader
        eyebrow="Safety & privacy"
        title={
          <>
            The <span className="text-red">short</span>, honest version.
          </>
        }
        lede="You're trusting us with your kid's time and attention. Here's exactly how a session works, what we keep, and what we never do."
      />
      <Prose>
        <h2 id="who">Who&apos;s on the call</h2>
        <p>
          Sessions happen in a Google Meet created just for your family. <strong>Your Panther tutor joins as a participant named
          &ldquo;{process.env.RECALL_BOT_NAME ?? "Panther Tutor"}&rdquo;.</strong> The tutor is Panther&apos;s own tutoring software — an
          AI tutor we built for grades 2–4 and supervise — not a stranger from a marketplace. It follows a fixed, kid-appropriate script
          of behaviours: it asks before telling, it never collects personal details, and it steers back to math if the conversation
          wanders.
        </p>
        <p>
          A member of our team reviews every safety flag the tutor raises, and parents are always welcome to sit in. If you ever want
          a human on the line, email us and we&apos;ll arrange it.
        </p>

        <h2 id="kids-data">What we collect about your child</h2>
        <ul>
          <li>
            <strong>First name, grade and the topic</strong> they need help with. That&apos;s the whole list.
          </li>
          <li>
            No last name, no birthday, no email, no photos of your child, no school name. Our forms don&apos;t even have fields for them.
          </li>
          <li>Kids never create accounts, never receive emails, and never enter payment details.</li>
        </ul>
        <div className="callout">
          <strong>Parents hold the keys.</strong> Only an adult who confirms they are the child&apos;s parent or guardian can create an
          account, book, or upload anything. Every consent is stored with a timestamp and the policy version you agreed to.
        </div>

        <h2 id="recordings">Nothing is recorded</h2>
        <p>
          Call audio and video are processed live and <strong>never stored</strong> — not by us, not by the tools we use to join the
          Meet. After the session, what remains is the written recap and practice problems you receive, which you can delete at any
          time.
        </p>

        <h2 id="uploads">Homework photos</h2>
        <p>
          Notes or homework you upload are private to your account, readable only by you and the tutor for that session, and deleted
          when you delete your child&apos;s data. Please avoid photos that show your child&apos;s face or full name.
        </p>

        <h2 id="payments">Payments</h2>
        <p>
          Stripe handles every card. Card numbers never touch our servers. For the free trial we store only a one-way
          fingerprint of the card so each family gets one trial — it can&apos;t be turned back into a card number.
        </p>

        <h2 id="tracking">No ad trackers, no session replay</h2>
        <p>
          We don&apos;t run advertising pixels, retargeting, or session-replay tools. If we use analytics at all it&apos;s a
          privacy-friendly, cookie-less counter that sees page views, not people.
        </p>

        <h2 id="delete">Delete everything, any time</h2>
        <p>
          Your dashboard has a <strong>&ldquo;Delete my child&apos;s data&rdquo;</strong> button. It removes your child&apos;s name and
          grade, their uploads, recaps and practice problems immediately. To close your parent account too, email{" "}
          <a href={`mailto:${config.brand.supportEmail}`}>{config.brand.supportEmail}</a> and we&apos;ll do it within 7 days.
        </p>

        <h2 id="more">The long version</h2>
        <p>
          <Link href="/parent-notice">Parent notice: what we collect and why</Link> · <Link href="/privacy">Privacy policy</Link> ·{" "}
          <Link href="/terms">Terms</Link>
        </p>
      </Prose>
    </main>
  );
}
