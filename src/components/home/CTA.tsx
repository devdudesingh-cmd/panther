import Link from "next/link";
import { config } from "@/config";
import Panther from "@/components/mascot/Panther";

export default function CTA() {
  return (
    <section className="relative mt-12 overflow-hidden bg-red text-white" aria-labelledby="cta-title">
      <div className="wrap relative grid items-end gap-8 py-20 md:grid-cols-[1.4fr_0.6fr] md:py-28">
        <div data-reveal>
          <h2 id="cta-title" className="text-display-xl font-extrabold">
            Ready to <span className="italic">pounce</span> on math?
          </h2>
          <p className="mt-6 max-w-xl text-lg text-white sm:text-xl">
            Book a {config.sessions.freeTrialEnabled ? `free ${config.sessions.trialMinutes}-minute trial` : "session"} today. Most families find a slot this
            week.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/book" className="btn btn-ghost min-h-14 px-7 text-lg">
              {config.sessions.freeTrialEnabled ? "Book the free trial" : "Book a session"}
            </Link>
            <Link href="/pricing" className="btn min-h-14 border-white bg-transparent px-6 text-lg text-white hover:bg-white/10">
              See pricing
            </Link>
          </div>
        </div>
        <div className="relative hidden md:block" aria-hidden="true">
          <Panther className="w-full max-w-[320px] translate-y-10 animate-float" followCursor={false} title="" />
        </div>
      </div>
    </section>
  );
}
