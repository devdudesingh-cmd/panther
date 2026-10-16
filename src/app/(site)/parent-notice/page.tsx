import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/config";
import { PageHeader, Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "Parent notice: what we collect",
  description: "A plain-language notice for parents about the information Panther collects from children and parents, and how it is used.",
};

export default function ParentNoticePage() {
  return (
    <main id="main" className="flex-1">
      <PageHeader
        eyebrow="Parent notice"
        title="What we collect, in plain language."
        lede={`This is the notice we're required to give you under the Children's Online Privacy Protection Act (COPPA) before collecting anything from a child under 13. Version ${config.legal.policyVersion}.`}
      />
      <Prose>
        <h2>Who we are</h2>
        <p>
          {config.legal.entityName} (&ldquo;{config.brand.name}&rdquo;) runs this website and the tutoring sessions. Questions about
          privacy go to <a href={`mailto:${config.brand.supportEmail}`}>{config.brand.supportEmail}</a>.
        </p>

        <h2>About your child</h2>
        <table>
          <thead>
            <tr>
              <th>We collect</th>
              <th>Why</th>
              <th>Kept until</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>First name</td>
              <td>So the tutor can say hi and the recap makes sense</td>
              <td>You delete it, or 12 months after your last session</td>
            </tr>
            <tr>
              <td>Grade</td>
              <td>To pitch problems at the right level</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>Topic / homework you upload</td>
              <td>So the session is about the actual work</td>
              <td>Same</td>
            </tr>
            <tr>
              <td>What your child says during the session</td>
              <td>Heard by the tutor; processed live by {config.tutoring.assistantName} to write the recap</td>
              <td>
                <strong>Not stored.</strong> Audio and video are never saved. Only the written recap remains.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          We do <strong>not</strong> collect your child&apos;s last name, email, phone, photo, school, address, location, or any
          persistent identifier. Tutors are trained not to ask for personal details, and if a child volunteers them we do not
          save them.
        </p>

        <h2>About you (the parent)</h2>
        <ul>
          <li>Email address (verified by a one-time code), name and optional phone — to run your account and send confirmations and reminders.</li>
          <li>Time zone — so times show correctly.</li>
          <li>Payment: handled by Stripe. We keep Stripe&apos;s reference IDs and, for the free trial, a one-way card fingerprint used only to enforce one trial per family.</li>
          <li>Your consent: the checkbox, when you ticked it, and which policy version you saw.</li>
        </ul>

        <h2>Who else sees it</h2>
        <p>We share data only with the services needed to run a session, each under its own privacy terms:</p>
        <ul>
          <li>
            <strong>Google</strong> (Google Meet and Calendar) — the meeting link and your calendar invite.
          </li>
          <li>
            <strong>Stripe</strong> — payments.
          </li>
          <li>
            <strong>Supabase</strong> — our database and file storage, in the United States.
          </li>
          <li>
            <strong>Resend</strong> — sends our emails to you (never to your child).
          </li>
          <li>
            <strong>Recall.ai</strong> and <strong>LiveKit</strong> — bring {config.tutoring.assistantName} into the Meet and carry its live audio. Configured so no recording is retained.
          </li>
        </ul>
        <p>We never sell personal information, and we never use children&apos;s information for advertising.</p>

        <h2>Your rights</h2>
        <ul>
          <li>Review what we hold about your child — it&apos;s all visible in your dashboard.</li>
          <li>Delete it any time with the &ldquo;Delete my child&apos;s data&rdquo; button, or by emailing us.</li>
          <li>Withdraw consent and stop any further collection by cancelling upcoming sessions and deleting the data.</li>
        </ul>
        <p>
          Full details are in our <Link href="/privacy">privacy policy</Link>. The friendly summary is on the{" "}
          <Link href="/safety">safety page</Link>.
        </p>
      </Prose>
    </main>
  );
}
