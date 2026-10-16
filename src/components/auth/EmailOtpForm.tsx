"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Email → 6-digit code sign-in. Works without leaving the page (important on
 * phones, where a magic link can open in a different browser). The email
 * Supabase sends also contains a magic link as a fallback.
 */
export default function EmailOtpForm({
  onSignedIn,
  nextPath = "/dashboard",
  initialEmail = "",
  compact = false,
}: {
  onSignedIn?: (user: { id: string; email: string }) => void;
  nextPath?: string;
  initialEmail?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That email doesn't look right.");
      return;
    }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message.includes("rate") ? "Too many tries — give it a minute and try again." : "We couldn't send the code. Please try again.");
      return;
    }
    setCanResend(false);
    window.setTimeout(() => setCanResend(true), 20_000);
    setStage("code");
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: "email" });
    setBusy(false);
    if (error || !data.user?.email) {
      setError("That code didn't work. Check it and try again, or request a new one.");
      return;
    }
    onSignedIn?.({ id: data.user.id, email: data.user.email });
  }

  if (stage === "code") {
    return (
      <form onSubmit={verify} className="space-y-4" aria-describedby="otp-help">
        <p id="otp-help" className={compact ? "text-ink-soft" : "text-lg text-ink-soft"}>
          We sent a 6-digit code to <strong className="text-ink">{email.trim()}</strong>. Enter it below (or tap the link in the email).
        </p>
        <div>
          <label htmlFor="otp-code" className="mb-1.5 block font-semibold">
            Code
          </label>
          <input
            ref={codeRef}
            id="otp-code"
            className="field display text-center text-3xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            required
          />
        </div>
        {error ? (
          <p className="rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary min-h-12" disabled={busy}>
            {busy ? "Checking…" : "Verify"}
          </button>
          <button
            type="button"
            className="btn btn-quiet min-h-12"
            disabled={busy || !canResend}
            onClick={() => sendCode()}
          >
            Resend code
          </button>
          <button type="button" className="btn btn-quiet min-h-12" onClick={() => setStage("email")}>
            Change email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-4">
      <div>
        <label htmlFor="otp-email" className="mb-1.5 block font-semibold">
          Your email
        </label>
        <input
          id="otp-email"
          className="field"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <p className="mt-1.5 text-sm text-ink-soft">We&apos;ll email you a one-time code. No passwords.</p>
      </div>
      {error ? (
        <p className="rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary min-h-12" disabled={busy}>
        {busy ? "Sending…" : "Send me a code"}
      </button>
    </form>
  );
}
