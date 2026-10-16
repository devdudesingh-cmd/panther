import { config } from "@/config";

const cards = [
  {
    title: "One kid. One tutor. Full attention.",
    body: "No group calls, no waiting for a turn. The whole session is about your child and the exact problem in front of them.",
    tone: "bg-white",
  },
  {
    title: "Built for 7–10-year-olds, not shrunk from high school.",
    body: "Short sessions, concrete examples, lots of \"what do you think?\" — the way kids this age actually learn.",
    tone: "bg-cream",
  },
  {
    title: "Parents see everything.",
    body: "Sit in whenever you like. Every session ends with a recap in plain English and a few practice problems — no mystery.",
    tone: "bg-blush",
  },
  {
    title: "No app. Just Google Meet.",
    body: "Your calendar invite has the link. Phone, tablet or laptop — if it opens Meet, it works.",
    tone: "bg-mint",
  },
];

/** Stacked sticky cards: each one parks under the last as you scroll. */
export default function Different() {
  return (
    <section className="wrap py-24 md:py-32" aria-labelledby="diff-title">
      <div className="max-w-2xl" data-reveal>
        <p className="eyebrow">What makes {config.brand.name} different</p>
        <h2 id="diff-title" className="text-display-lg mt-4">
          Small sessions, big&nbsp;wins.
        </h2>
      </div>
      <ul className="mt-12 space-y-6 md:mt-16">
        {cards.map((c, i) => (
          <li
            key={c.title}
            className={`card sticky p-7 sm:p-10 md:p-14 ${c.tone}`}
            style={{ top: `calc(5.5rem + ${i * 1.25}rem)` }}
          >
            <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-12">
              <div className="display text-6xl font-extrabold leading-none tracking-tighter text-red md:text-8xl" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="text-display-sm font-extrabold">{c.title}</h3>
                <p className="mt-4 max-w-xl text-lg text-ink-soft">{c.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
