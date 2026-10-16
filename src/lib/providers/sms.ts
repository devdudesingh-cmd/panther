import { env, hasEnv } from "@/lib/env";

export interface AlertProvider {
  /** Text the business owner. Never used for parents. */
  alertOwner(message: string): Promise<void>;
}

/** Twilio over plain REST — no SDK needed for one endpoint. */
export function twilioProvider(): AlertProvider {
  return {
    async alertOwner(message) {
      if (!hasEnv("twilio")) {
        console.warn("[alert] Twilio not configured:", message);
        return;
      }
      const t = env("twilio");
      const body = new URLSearchParams({ To: t.ALERT_PHONE_NUMBER, From: t.TWILIO_FROM_NUMBER, Body: message.slice(0, 1500) });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${t.TWILIO_ACCOUNT_SID}:${t.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    },
  };
}
