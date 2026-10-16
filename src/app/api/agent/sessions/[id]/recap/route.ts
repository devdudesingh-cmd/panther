import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { bearerMatches, fail, handleError, json, parseBody } from "@/lib/api";
import { saveRecap } from "@/lib/agent";

const Body = z.object({
  recap: z.string().trim().min(10).max(4000),
  practice: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(200),
        answer: z.string().trim().min(1).max(50),
        hint: z.string().trim().max(200).optional(),
      }),
    )
    .max(20)
    .default([]),
});

/** POST /api/agent/sessions/:id/recap — save the recap + practice, email the parent once. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  if (!bearerMatches(req, process.env.AGENT_API_KEY)) return fail(401, "UNAUTHORIZED", "Bad agent key.");
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    const result = await saveRecap(id, body.recap, body.practice);
    return json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return fail(404, "NOT_FOUND", "No such session.");
    return handleError(e);
  }
}
