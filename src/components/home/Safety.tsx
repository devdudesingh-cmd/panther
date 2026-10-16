import Link from "next/link";

const points = [
  {
    title: "Real tutors, chosen by us",
    body: "Professional tutors and trained high-school students — a real person on every call, never a chatbot pretending to be one.",
  },
  {
    title: "A note-taker, not a recorder",
    body: "Panther Assistant joins the Meet to write the recap and practice problems. It never records or stores the call.",
  },
  {
    title: "Parents hold the account",
    body: "Only a parent or guardian can sign up and book. Kids never create accounts or get emails from us.",
  },
  {
    title: "We collect almost nothing about your child",
    body: "First name, grade and the topic — that's it. No last names, no photos, no kid emails.",
  },
  {
    title: "Nothing is recorded",
    body: "Call audio and video are never stored. Homework photos are private to you and deleted on request.",
  },
  {
    title: "Stripe handles the money",
    body: "Card numbers never touch our servers. No ad trackers, no session-replay tools, ever.",
  },
];

export default function Safety() {
  return (
    <section className="wrap py-24 md:py-32" aria-labelledby="safety-title">
      <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
        <div data-reveal>
          <p className="eyebrow">Safety &amp; privacy</p>
          <h2 id="safety-title" className="text-display-lg mt-4">
            Built like we&apos;d want for our&nbsp;own&nbsp;kids.
          </h2>
          <p className="mt-5 text-lg text-ink-soft">
            Trust shouldn&apos;t take a 40-page policy. Here&apos;s the short version — and the long one is a click away.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/safety" className="btn btn-ghost">
              Read the full safety page
            </Link>
            <Link href="/parent-notice" className="btn btn-quiet">
              What we collect →
            </Link>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2" data-reveal-stagger>
          {points.map((p) => (
            <li key={p.title} className="rounded-3xl border-2 border-ink bg-white p-6">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-mint text-ink" aria-hidden="true">
                ✓
              </div>
              <h3 className="display text-lg font-extrabold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-ink-soft">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
