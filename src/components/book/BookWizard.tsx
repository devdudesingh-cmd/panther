"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { config, formatPrice } from "@/config";
import { supabaseBrowser } from "@/lib/supabase/client";
import EmailOtpForm from "@/components/auth/EmailOtpForm";
import SlotPicker from "./SlotPicker";
import { useDetectedTimeZone } from "./useSlots";

type Kind = "trial" | "paid";
type Step = 1 | 2 | 3 | 4 | 5;
const STEPS = ["Session", "Time", "You", "Your kid", "Confirm"];

interface User {
  id: string;
  email: string;
}

/**
 * The booking flow: session type → time → parent (email code) → kid →
 * consent + pay. Everything is validated again on the server.
 */
export default function BookWizard({ initialKind, cancelledId }: { initialKind: Kind | null; cancelledId: string | null }) {
  const [step, setStep] = useState<Step>(initialKind ? 2 : 1);
  const [kind, setKind] = useState<Kind>(initialKind ?? (config.sessions.freeTrialEnabled ? "trial" : "paid"));
  const detectedTz = useDetectedTimeZone();
  const [tzOverride, setTz] = useState<string | null>(null);
  const tz = tzOverride ?? detectedTz;
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [adult, setAdult] = useState(false);
  const [kidName, setKidName] = useState("");
  const [grade, setGrade] = useState<number>(config.sessions.grades[0]);
  const [topic, setTopic] = useState<string>(config.sessions.topics[0]);
  const [topicOther, setTopicOther] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user?.email) setUser({ id: data.user.id, email: data.user.email });
      });
  }, []);

  const price = kind === "trial" ? 0 : config.pricing.paidSessionCents;
  const minutes = kind === "trial" ? config.sessions.trialMinutes : config.sessions.paidMinutes;
  const finalTopic = topic === "Something else" ? topicOther.trim() : topic;

  function go(next: Step) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!user || !startsAt) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          startsAt,
          child: { firstName: kidName.trim(), grade },
          topic: finalTopic,
          parentTz: tz,
          fullName: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          adultGuardian: true,
          consent: true,
          policyVersion: config.legal.policyVersion,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const code = json?.error?.code as string | undefined;
        setError(json?.error?.message ?? "Something went wrong. Please try again.");
        if (code === "SLOT_FULL" || code === "SLOT_PAST" || code === "SLOT_TOO_SOON" || code === "SLOT_BLOCKED") {
          setStartsAt(null);
          setStep(2);
        }
        if (code === "TRIAL_USED") setKind("paid");
        setBusy(false);
        return;
      }
      window.location.assign(json.checkoutUrl as string);
    } catch {
      setError("Network hiccup — please try again.");
      setBusy(false);
    }
  }

  const when = startsAt ? DateTime.fromISO(startsAt).setZone(tz) : null;

  return (
    <div className="mx-auto max-w-2xl">
      {cancelledId && step <= 2 ? (
        <p className="mb-6 rounded-2xl border-2 border-ink bg-cream px-5 py-4 text-sm" role="status">
          No worries — checkout was cancelled and nothing was charged. Pick a time whenever you&apos;re ready.
        </p>
      ) : null}

      {/* Progress */}
      <ol className="mb-8 grid grid-cols-5 gap-1.5" aria-label="Booking steps">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const active = n === step;
          return (
            <li key={label} className="text-center">
              <div className={`h-1.5 rounded-full ${done || active ? "bg-red" : "bg-line"}`} aria-hidden="true" />
              <span className={`mt-1.5 hidden text-xs font-semibold sm:block ${active ? "text-ink" : "text-ink-soft"}`} aria-current={active ? "step" : undefined}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="card p-6 sm:p-8">
        {step === 1 && (
          <section aria-labelledby="s1">
            <h2 id="s1" className="text-display-sm">
              What would you like to book?
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {config.sessions.freeTrialEnabled && (
                <KindCard
                  selected={kind === "trial"}
                  onClick={() => setKind("trial")}
                  title={`Free ${config.sessions.trialMinutes}-minute trial`}
                  price="$0"
                  body="One per family. A real session with a real recap. A card is needed to reserve it; nothing is charged."
                />
              )}
              <KindCard
                selected={kind === "paid"}
                onClick={() => setKind("paid")}
                title={`${config.sessions.paidMinutes}-minute session`}
                price={formatPrice(config.pricing.paidSessionCents)}
                body={`Full session with homework upload, recap and practice. Free reschedule or refund up to ${config.sessions.freeCancelHours}h before.`}
              />
            </div>
            <div className="mt-8 flex justify-end">
              <button type="button" className="btn btn-primary min-h-12" onClick={() => go(2)}>
                Pick a time →
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="s2">
            <h2 id="s2" className="text-display-sm">
              Pick a time
            </h2>
            <p className="mt-2 text-ink-soft">
              {minutes}-minute {kind === "trial" ? "trial" : "session"}. Times shown in your time zone.
            </p>
            <div className="mt-6">
              <SlotPicker kind={kind} tz={tz} onTzChange={setTz} value={startsAt} onChange={setStartsAt} />
            </div>
            <Nav onBack={() => go(1)} onNext={() => go(3)} nextDisabled={!startsAt} />
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="s3">
            <h2 id="s3" className="text-display-sm">
              About you
            </h2>
            {!user ? (
              <div className="mt-6">
                <p className="mb-5 text-ink-soft">First, let&apos;s verify your email so we can send the Meet link and your calendar invite.</p>
                <EmailOtpForm compact nextPath="/book" onSignedIn={(u) => setUser(u)} />
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <p className="rounded-xl bg-mint px-4 py-3 text-sm font-semibold">
                  ✓ Signed in as {user.email}.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
                      await supabaseBrowser().auth.signOut();
                      setUser(null);
                    }}
                  >
                    Not you?
                  </button>
                </p>
                <div>
                  <label htmlFor="fullName" className="mb-1.5 block font-semibold">
                    Your name
                  </label>
                  <input id="fullName" className="field" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Rivera" required />
                </div>
                <div>
                  <label htmlFor="phone" className="mb-1.5 block font-semibold">
                    Mobile number <span className="font-normal text-ink-soft">(optional, for last-minute changes)</span>
                  </label>
                  <input id="phone" className="field" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 010-2030" />
                </div>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-red" checked={adult} onChange={(e) => setAdult(e.target.checked)} required />
                  <span>
                    I&apos;m {config.legal.minParentAge} or older and the parent or legal guardian of the child I&apos;m booking for.
                  </span>
                </label>
                <Nav onBack={() => go(2)} onNext={() => go(4)} nextDisabled={!fullName.trim() || !adult} />
              </div>
            )}
            {!user ? (
              <div className="mt-6">
                <button type="button" className="btn btn-quiet min-h-12" onClick={() => go(2)}>
                  ← Back
                </button>
              </div>
            ) : null}
          </section>
        )}

        {step === 4 && (
          <section aria-labelledby="s4">
            <h2 id="s4" className="text-display-sm">
              About your kid
            </h2>
            <p className="mt-2 text-ink-soft">Just a first name, grade and what they need help with. We never ask for more.</p>
            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="kidName" className="mb-1.5 block font-semibold">
                  First name
                </label>
                <input id="kidName" className="field" value={kidName} onChange={(e) => setKidName(e.target.value)} placeholder="Maya" maxLength={40} autoComplete="off" required />
              </div>
              <fieldset>
                <legend className="mb-2 font-semibold">Grade</legend>
                <div className="flex flex-wrap gap-2">
                  {config.sessions.grades.map((g) => (
                    <label key={g} className={`btn min-h-12 cursor-pointer px-5 ${grade === g ? "bg-ink text-white" : "btn-ghost"}`}>
                      <input type="radio" name="grade" className="sr-only" value={g} checked={grade === g} onChange={() => setGrade(g)} />
                      Grade {g}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="topic" className="mb-1.5 block font-semibold">
                  What should we work on?
                </label>
                <select id="topic" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {config.sessions.topics.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option>Something else</option>
                </select>
                {topic === "Something else" ? (
                  <input className="field mt-2" value={topicOther} onChange={(e) => setTopicOther(e.target.value)} placeholder="Tell us in a few words" maxLength={120} aria-label="Describe the topic" />
                ) : null}
                <p className="mt-1.5 text-sm text-ink-soft">You can upload the actual homework after booking.</p>
              </div>
            </div>
            <Nav onBack={() => go(3)} onNext={() => go(5)} nextDisabled={!kidName.trim() || !finalTopic} />
          </section>
        )}

        {step === 5 && user && when && (
          <section aria-labelledby="s5">
            <h2 id="s5" className="text-display-sm">
              Looks good?
            </h2>
            <dl className="mt-6 grid gap-3 rounded-2xl bg-cream p-5 sm:grid-cols-2">
              <Row k="Session" v={kind === "trial" ? `Free ${minutes}-min trial` : `${minutes}-min session`} />
              <Row k="When" v={`${when.toFormat("ccc, LLL d")} · ${when.toFormat("h:mm a ZZZZ")}`} />
              <Row k="For" v={`${kidName.trim()}, grade ${grade}`} />
              <Row k="Topic" v={finalTopic} />
              <Row k="Parent" v={`${fullName.trim()} · ${user.email}`} />
              <Row k="Price" v={price ? formatPrice(price) : "$0 — card on file, nothing charged"} />
            </dl>
            <label className="mt-6 flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-red" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span className="text-[15px]">
                I consent to Panther collecting my child&apos;s first name, grade and topic to provide tutoring, as described in the{" "}
                <Link href="/parent-notice" target="_blank" className="font-semibold text-red underline-offset-4 hover:underline">
                  parent notice
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="font-semibold text-red underline-offset-4 hover:underline">
                  privacy policy
                </Link>
                . I agree to the{" "}
                <Link href="/terms" target="_blank" className="font-semibold text-red underline-offset-4 hover:underline">
                  terms
                </Link>
                .
              </span>
            </label>
            {error ? (
              <p className="mt-4 rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="btn btn-quiet min-h-12" onClick={() => go(4)} disabled={busy}>
                ← Back
              </button>
              <button type="button" className="btn btn-primary min-h-13 px-7" onClick={submit} disabled={!consent || busy}>
                {busy ? "One moment…" : price ? `Pay ${formatPrice(price)} securely` : "Reserve my free trial"}
              </button>
            </div>
            <p className="mt-4 text-xs text-ink-soft">
              You&apos;ll finish on Stripe&apos;s secure page. Your time is held for {config.sessions.holdMinutes} minutes while you check out.
            </p>
          </section>
        )}
        {step === 5 && (!user || !when) ? (
          <p className="text-ink-soft">
            Something&apos;s missing.{" "}
            <button type="button" className="font-semibold text-red underline" onClick={() => go(!when ? 2 : 3)}>
              Go back
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function KindCard({ selected, onClick, title, price, body }: { selected: boolean; onClick: () => void; title: string; price: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-3xl border-2 p-5 text-left transition-all ${selected ? "border-ink bg-cream shadow-sticker" : "border-line bg-white hover:border-ink"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="display text-xl font-extrabold tracking-tight">{title}</span>
        <span className="display text-2xl font-extrabold text-red">{price}</span>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{body}</p>
    </button>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button type="button" className="btn btn-quiet min-h-12" onClick={onBack}>
        ← Back
      </button>
      <button type="button" className="btn btn-primary min-h-12" onClick={onNext} disabled={nextDisabled}>
        Continue →
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
