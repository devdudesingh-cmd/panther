import { connection, type NextRequest } from "next/server";
import { bearerMatches, fail, handleError, json } from "@/lib/api";
import { sessionContext } from "@/lib/agent";

/** GET /api/agent/sessions/:id — everything the session assistant needs before joining. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  if (!bearerMatches(req, process.env.AGENT_API_KEY)) return fail(401, "UNAUTHORIZED", "Bad agent key.");
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, "INVALID", "Bad session id.");
    const context = await sessionContext(id);
    if (!context) return fail(404, "NOT_FOUND", "No such session.");
    return json(context, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleError(e);
  }
}
