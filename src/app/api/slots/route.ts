import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { bookingService } from "@/lib/booking";
import { fail, handleError, json } from "@/lib/api";
import { isValidZone } from "@/lib/time";

const Query = z.object({
  kind: z.enum(["trial", "paid"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz: z.string().min(1),
});

/**
 * GET /api/slots?kind=paid&from=2026-10-20&to=2026-10-27&tz=America/New_York
 * Open slots grouped by the parent's local day. Public — no PII involved.
 */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const q = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
    if (!isValidZone(q.tz)) return fail(400, "INVALID", "Unknown time zone.");
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (days < 0 || days > 31) return fail(400, "INVALID", "Date range must be 0–31 days.");
    const slots = await bookingService().slots({ kind: q.kind, fromDate: q.from, toDate: q.to, parentTz: q.tz });
    return json({ slots }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleError(e);
  }
}
