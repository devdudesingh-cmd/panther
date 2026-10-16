"use client";

import { useRouter, useSearchParams } from "next/navigation";
import EmailOtpForm from "@/components/auth/EmailOtpForm";

export default function LoginClient() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const linkError = params.get("error") === "link";

  return (
    <>
      {linkError ? (
        <p className="mb-4 rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
          That sign-in link has expired or was already used. Request a new code below.
        </p>
      ) : null}
      <EmailOtpForm
        nextPath={next}
        onSignedIn={() => {
          router.replace(next);
          router.refresh();
        }}
      />
    </>
  );
}

function safeNext(v: string | null): string {
  if (!v || !v.startsWith("/") || v.startsWith("//")) return "/dashboard";
  return v;
}
