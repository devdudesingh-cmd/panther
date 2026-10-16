import type { NextRequest } from "next/server";
import { z } from "zod";
import { bookingService } from "@/lib/booking";
import { fail, handleError, json, parseBody, requireUser, Unauthorized } from "@/lib/api";

const Body = z.object({ startsAt: z.iso.datetime() });

/** POST /api/bookings/:id/reschedule { startsAt } — free up to 24h before. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { startsAt } = await parseBody(req, Body);
    const s = await bookingService().reschedule({ sessionId: id, parentId: user.id, startsAt });
    return json({ status: s.status, startsAt: s.starts_at, endsAt: s.ends_at });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
