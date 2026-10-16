import Link from "next/link";
import { config } from "@/config";
import HeroTitle from "./HeroTitle";
import MathCard from "./MathCard";

export default function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      {/* soft red blob behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[20%] top-[8%] h-[70vw] max-h-[720px] w-[70vw] max-w-[720px] rounded-full bg-blush blur-3xl md:-right-[5%]"
      />
      <div className="wrap relative grid items-center gap-12 pb-20 pt-10 md:grid-cols-[1.1fr_0.9fr] md:gap-8 md:pb-28 md:pt-16 lg:gap-16">
        <div>
          <p className="eyebrow hero-after">
            <span className="inline-block h-2 w-2 rounded-full bg-red" /> Grades 2–4 · live on Google Meet
          </p>
          <HeroTitle className="text-hero mt-5 font-extrabold">
            Math help kids <span className="text-red">actually</span> look forward&nbsp;to.
          </HeroTitle>
          <p className="hero-after mt-6 max-w-[34rem] text-lg text-ink-soft sm:text-xl">
            One kid, one tutor, one {config.sessions.paidMinutes}-minute session on Google Meet — no app to install. Upload the
            homework, we work through it together, and you get a recap and practice afterwards.
          </p>
          <div className="hero-after mt-8 flex flex-wrap items-center gap-3">
            <Link href="/book" className="btn btn-primary min-h-14 px-7 text-lg">
              {config.sessions.freeTrialEnabled ? `Book a free ${config.sessions.trialMinutes}-min trial` : "Book a session"}
            </Link>
            <a href="#how" className="btn btn-ghost min-h-14 px-6 text-lg">
              See how it works
            </a>
          </div>
          <ul className="hero-after mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft">
            <li>✓ No card charged for the trial</li>
            <li>✓ Cancel free up to {config.sessions.freeCancelHours}h before</li>
            <li>✓ Parents welcome to sit in</li>
          </ul>
        </div>

        <div className="relative pt-10 md:pt-0">
          <MathCard />
        </div>
      </div>
    </section>
  );
}
