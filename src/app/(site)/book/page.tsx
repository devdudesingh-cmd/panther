import type { Metadata } from "next";
import { Suspense } from "react";
import { config } from "@/config";
import BookClient from "./BookClient";

export const metadata: Metadata = {
  title: "Book a session",
  description: `Book a free ${config.sessions.trialMinutes}-minute trial or a ${config.sessions.paidMinutes}-minute math session on Google Meet.`,
};

/** Same footprint as the wizard's first step, so hydration doesn't shift the page. */
function WizardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading the booking form">
      <div className="mb-8 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-1.5 rounded-full ${i === 0 ? "bg-red" : "bg-line"}`} />
        ))}
      </div>
      <div className="card min-h-[30rem] p-6 sm:min-h-[26rem] sm:p-8">
        <div className="h-8 w-2/3 rounded bg-line" />
        <div className="mt-6 h-40 rounded-3xl bg-line/60" />
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <main id="main" className="wrap flex-1 py-10 md:py-16">
      <div className="mx-auto mb-8 max-w-2xl">
        <p className="eyebrow">Book</p>
        <h1 className="text-display-md mt-3">Let&apos;s find a time.</h1>
      </div>
      <Suspense fallback={<WizardSkeleton />}>
        <BookClient />
      </Suspense>
    </main>
  );
}
