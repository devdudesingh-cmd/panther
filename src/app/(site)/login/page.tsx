import type { Metadata } from "next";
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Parent login",
  description: "Sign in to your Panther parent dashboard with a one-time email code.",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main id="main" className="wrap flex-1 py-16 md:py-24">
      <div className="mx-auto max-w-lg">
        <p className="eyebrow">Parent login</p>
        <h1 className="text-display-md mt-4">Welcome back.</h1>
        <p className="mt-4 text-lg text-ink-soft">Sign in to see upcoming sessions, upload homework, and read recaps.</p>
        <div className="card mt-8 p-6 sm:p-8">
          <Suspense fallback={null}>
            <LoginClient />
          </Suspense>
        </div>
        <p className="mt-6 text-sm text-ink-soft">
          Only parents and guardians have accounts. Kids never sign in.
        </p>
      </div>
    </main>
  );
}
