import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/config";
import { PageHeader, Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Panther's privacy policy.",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="flex-1">
      <PageHeader eyebrow="Privacy policy" title="Privacy policy" lede={`Effective ${config.legal.effectiveDate} · version ${config.legal.policyVersion}`} />
      <Prose>
        <p>
          This policy explains how {config.legal.entityName} (&ldquo;{config.brand.name}&rdquo;, &ldquo;we&rdquo;) collects, uses and
          protects personal information when you use panther&apos;s website and tutoring sessions (the &ldquo;Service&rdquo;). The
          plain-language summary for parents is in our <Link href="/parent-notice">parent notice</Link>; where the two differ, this
          policy controls.
        </p>

        <h2>1. Children&apos;s privacy (COPPA)</h2>
        <p>
          The Service is used by children under 13 with their parent or guardian&apos;s consent. We collect from children only what
          is reasonably necessary to provide tutoring: a first name, a grade level, the topic or homework the parent uploads, and
          what the child says during a live session (heard by the tutor and processed in real time by our session assistant to
          write the recap; never stored as audio or video). We do not knowingly
          collect any other personal information from children, we do not condition participation on disclosing more, and we never
          use children&apos;s information for marketing or advertising.
        </p>
        <p>
          Parents may review, delete, or refuse further collection of their child&apos;s information at any time through the
          dashboard or by emailing <a href={`mailto:${config.brand.supportEmail}`}>{config.brand.supportEmail}</a>. If we learn we
          have collected information from a child without verifiable parental consent, we delete it promptly.
        </p>

        <h2>2. Information we collect</h2>
        <h3>From parents</h3>
        <ul>
          <li>Account: email address (verified), name, optional phone number, time zone.</li>
          <li>Consent records: the consent you gave, when, and which policy version applied.</li>
          <li>Payment references from Stripe (customer, payment and refund IDs). Card numbers are collected by Stripe and never reach us. For free trials, a one-way card fingerprint provided by Stripe is stored to limit trials to one per family.</li>
          <li>Technical: IP address (stored only as a truncated hash with consent records), browser type, and basic server logs.</li>
        </ul>
        <h3>From children</h3>
        <ul>
          <li>First name and grade, entered by the parent.</li>
          <li>Topic and any notes or homework the parent uploads.</li>
          <li>Live session speech, heard by the tutor and processed in real time by the session assistant to generate a written recap and practice problems.</li>
        </ul>

        <h2>3. How we use information</h2>
        <ul>
          <li>To schedule, deliver and follow up tutoring sessions, including confirmations, reminders and recaps.</li>
          <li>To process payments and refunds and prevent abuse (such as repeat free trials).</li>
          <li>To keep children safe: tutors and the session assistant flag concerning content for review by our team.</li>
          <li>To operate, secure and improve the Service. We do not profile children or use their data to train general-purpose models.</li>
        </ul>

        <h2>4. Sharing</h2>
        <p>
          We share information only with processors that help us run the Service, bound by contracts limiting their use of it:
          Google (Meet, Calendar), Stripe (payments), Supabase (database and storage), Resend (email), Recall.ai and LiveKit (bringing
          the session assistant into the meeting and carrying live audio, configured not to retain recordings), and Twilio (operational alerts to our team,
          which never include a child&apos;s name). We may also disclose information when required by law or to protect safety.
          <strong> We do not sell personal information.</strong>
        </p>

        <h2>5. Cookies and analytics</h2>
        <p>
          We use only the cookies needed to keep you signed in. We do not use advertising cookies, tracking pixels or session-replay
          tools. If analytics are enabled, they are cookie-less and aggregate.
        </p>

        <h2>6. Retention</h2>
        <ul>
          <li>Session audio and video: not retained.</li>
          <li>Child name, grade, uploads, recaps and practice: until you delete them, or 12 months after your last session.</li>
          <li>Parent account and payment records: for as long as you have an account, plus what tax and accounting law require.</li>
          <li>Trial-claim hashes: retained to prevent repeat free trials; they cannot be reversed into an email, phone or card number.</li>
        </ul>

        <h2>7. Security</h2>
        <p>
          Data is encrypted in transit and at rest. Access to parent and child data in our database is restricted by row-level
          security so each parent can see only their own family. Uploads live in a private bucket readable only by the uploading
          parent.
        </p>

        <h2>8. Your choices and rights</h2>
        <p>
          You can access and correct your information in the dashboard, delete your child&apos;s data with one click, and close your
          account by emailing us. Depending on where you live you may have additional rights (for example under the CCPA/CPRA); we
          honor them regardless of location — just ask.
        </p>

        <h2>9. Changes</h2>
        <p>
          We&apos;ll post changes here, update the version and effective date, and ask for fresh consent before a session if the
          changes affect children&apos;s data.
        </p>

        <h2>10. Contact</h2>
        <p>
          {config.legal.entityName} · <a href={`mailto:${config.brand.supportEmail}`}>{config.brand.supportEmail}</a>
        </p>
      </Prose>
    </main>
  );
}
