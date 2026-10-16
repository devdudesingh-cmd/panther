import { connection, type NextRequest } from "next/server";
import { bookingService } from "@/lib/booking";
import { fail, handleError, json, requireAdmin, Unauthorized } from "@/lib/api";

/** POST /api/admin/sessions/:id/cancel — admin cancel; always refunds paid sessions. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const { session, refunded } = await bookingService().cancel({ sessionId: id, parentId: null, reason: "cancelled_by_admin" });
    return json({ status: session.status, refunded });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please sign in.");
    return handleError(e);
  }
}
