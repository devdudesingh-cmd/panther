import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { bearerMatches, fail, handleError, json, parseBody } from "@/lib/api";
import { raiseSafetyFlag } from "@/lib/agent";

const Body = z.object({
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  note: z.string().trim().min(3).max(2000),
});

/** POST /api/agent/sessions/:id/flag — raise a safety flag; medium/high texts the owner. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  if (!bearerMatches(req, process.env.AGENT_API_KEY)) return fail(401, "UNAUTHORIZED", "Bad agent key.");
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    const flag = await raiseSafetyFlag(id, body.severity, body.note);
    return json({ ok: true, id: flag.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
