import type { NextRequest } from "next/server";
import { bookingService } from "@/lib/booking";
import { fail, handleError, json, requireUser, Unauthorized } from "@/lib/api";

/** POST /api/bookings/:id/cancel — parent cancels; refund is automatic when eligible. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { session, refunded } = await bookingService().cancel({ sessionId: id, parentId: user.id });
    return json({ status: session.status, refunded });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
