import { connection, type NextRequest } from "next/server";
import { bookingService } from "@/lib/booking";
import { bearerMatches, fail, json } from "@/lib/api";

/**
 * POST /api/cron/tick — called every 5 minutes by netlify/functions/cron-tick.mts.
 * Expires stale holds, marks finished sessions completed, sends 24h/1h
 * reminders, retries unfinished fulfillment.
 */
export async function POST(req: NextRequest) {
  await connection();
  if (!bearerMatches(req, process.env.CRON_SECRET)) return fail(401, "UNAUTHORIZED", "Bad cron secret.");
  try {
    const result = await bookingService().tick();
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] tick failed:", e);
    return fail(500, "TICK_FAILED", (e as Error).message);
  }
}

export const GET = POST;
