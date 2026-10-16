import type { Config } from "@netlify/functions";

/**
 * Netlify scheduled function. Scheduled functions can't carry a payload and
 * have a 30 s limit, so this only pokes the Next.js route that does the work.
 * `URL` is set by Netlify to the site's primary URL.
 */
const cronTick = async () => {
  const base = process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("cron-tick: URL or CRON_SECRET missing");
    return;
  }
  const res = await fetch(`${base}/api/cron/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  console.log("cron-tick:", res.status, await res.text());
};

export default cronTick;

export const config: Config = {
  schedule: "*/5 * * * *",
};
