import { Resend } from "resend";
import { env, hasEnv } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

let cached: Resend | null = null;

export function resendProvider(): EmailProvider {
  return {
    async send(msg) {
      if (!hasEnv("resend")) {
        console.warn("[email] Resend not configured; would send:", msg.subject, "→", msg.to);
        return;
      }
      cached ??= new Resend(env("resend").RESEND_API_KEY);
      const { error } = await cached.emails.send({
        from: env("resend").EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      if (error) throw new Error(`Resend: ${error.message}`);
    },
  };
}
