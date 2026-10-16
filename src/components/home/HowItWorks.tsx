import { config } from "@/config";
import HowItWorksMotion from "./HowItWorksMotion";

export const steps = [
  {
    n: "01",
    title: "Pick a time",
    body: `Choose a free trial or a ${config.sessions.paidMinutes}-minute session and a slot that fits your evening or weekend. You'll see times in your own time zone.`,
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
        <rect x="6" y="10" width="36" height="32" rx="6" fill="#fff" stroke="#1B0E0E" strokeWidth="2.5" />
        <path d="M6 20h36" stroke="#1B0E0E" strokeWidth="2.5" />
        <path d="M16 6v8M32 6v8" stroke="#1B0E0E" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="24" y="26" width="10" height="8" rx="2" fill="#D6111E" />
      </svg>
    ),
  },
  {
    n: "02",
    title: "Snap the homework",
    body: "Upload a photo of the worksheet or jot down what's tricky. The tutor reads it before the session, so no time is wasted.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
        <rect x="8" y="14" width="32" height="24" rx="5" fill="#fff" stroke="#1B0E0E" strokeWidth="2.5" />
        <circle cx="24" cy="26" r="7" fill="#FFE3DC" stroke="#1B0E0E" strokeWidth="2.5" />
        <circle cx="24" cy="26" r="2.5" fill="#D6111E" />
        <path d="M18 14l3-5h6l3 5" fill="#fff" stroke="#1B0E0E" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    n: "03",
    title: "Tutor joins your Meet",
    body: "Open the Google Meet link from your calendar invite. Your Panther tutor is already there, says hi, and gets to work — patiently, one step at a time.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
        <rect x="6" y="12" width="26" height="24" rx="5" fill="#fff" stroke="#1B0E0E" strokeWidth="2.5" />
        <path d="M32 20l10-5v18l-10-5z" fill="#D6111E" stroke="#1B0E0E" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="19" cy="22" r="4" fill="#1B0E0E" />
        <path d="M12 32c2-4 12-4 14 0" stroke="#1B0E0E" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: "04",
    title: "Recap + practice",
    body: "Right after, you get a plain-English recap of what clicked and what to watch, plus a few practice problems your kid can do in five minutes.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
        <path d="M10 8h22l8 8v24a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" fill="#fff" stroke="#1B0E0E" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M32 8v8h8" fill="#FFE3DC" stroke="#1B0E0E" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M15 24h18M15 30h12" stroke="#1B0E0E" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M14 36l3 3 6-6" stroke="#D6111E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="wrap scroll-mt-24 py-24 md:py-32" aria-labelledby="how-title">
      <div className="max-w-2xl" data-reveal>
        <p className="eyebrow">How a session works</p>
        <h2 id="how-title" className="text-display-lg mt-4">
          Four steps. Zero&nbsp;hassle.
        </h2>
      </div>

      <div className="relative mt-12 grid gap-10 md:mt-16 md:grid-cols-[0.8fr_1.2fr] md:gap-16" data-how>
        {/* Sticky numeral + progress path (desktop) */}
        <div className="hidden md:block">
          <div className="sticky top-28">
            <div className="relative h-[420px] w-full max-w-[320px]">
              <svg viewBox="0 0 320 420" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <path d="M40 30 C 260 60, 60 170, 200 210 S 80 360, 280 390" fill="none" stroke="#EAD9D2" strokeWidth="6" strokeLinecap="round" />
                <path
                  data-how-path
                  d="M40 30 C 260 60, 60 170, 200 210 S 80 360, 280 390"
                  fill="none"
                  stroke="#D6111E"
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
                />
                {[
                  [40, 30],
                  [146, 128],
                  [200, 210],
                  [280, 390],
                ].map(([cx, cy], i) => (
                  <circle key={i} data-how-dot cx={cx} cy={cy} r="11" fill="#FFF8F2" stroke="#1B0E0E" strokeWidth="3" />
                ))}
              </svg>
              <div className="display absolute right-0 top-1/2 -translate-y-1/2 text-[9rem] font-extrabold leading-none tracking-tighter text-ink/10" aria-hidden="true">
                <span data-how-num>01</span>
              </div>
            </div>
          </div>
        </div>

        <ol className="relative space-y-6 md:space-y-10">
          {steps.map((s, i) => (
            <li
              key={s.n}
              data-how-step={i}
              className="card group relative flex gap-5 p-6 transition-colors sm:p-8 data-[active=true]:bg-cream"
            >
              <div className="shrink-0">{s.icon}</div>
              <div>
                <div className="display text-sm font-bold text-red">{s.n}</div>
                <h3 className="display mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{s.title}</h3>
                <p className="mt-2 text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <HowItWorksMotion />
    </section>
  );
}
