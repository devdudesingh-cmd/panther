import type { NextRequest } from "next/server";
import { z } from "zod";
import { config } from "@/config";
import { bookingService } from "@/lib/booking";
import { clientIp, fail, handleError, json, parseBody, requireUser, Unauthorized } from "@/lib/api";
import { hashIp } from "@/lib/hash";
import { isValidZone } from "@/lib/time";

const Body = z.object({
  kind: z.enum(["trial", "paid"]),
  startsAt: z.iso.datetime(),
  child: z.object({
    id: z.uuid().optional(),
    firstName: z.string().trim().min(1).max(40),
    grade: z.number().int(),
  }),
  topic: z.string().trim().max(120),
  parentTz: z.string(),
  fullName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  adultGuardian: z.literal(true),
  consent: z.literal(true),
  policyVersion: z.string(),
});

/**
 * POST /api/bookings — hold a slot and start Stripe Checkout.
 * Requires a signed-in (email-verified) parent. Returns { sessionId, checkoutUrl }.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, Body);
    if (!isValidZone(body.parentTz)) return fail(400, "INVALID", "Unknown time zone.");
    if (body.policyVersion !== config.legal.policyVersion) {
      return fail(409, "POLICY_CHANGED", "Our privacy policy was updated. Please reload and review it again.");
    }
    const result = await bookingService().hold({
      parentId: user.id,
      kind: body.kind,
      startsAt: body.startsAt,
      child: body.child,
      topic: body.topic,
      parentTz: body.parentTz,
      fullName: body.fullName ?? null,
      phone: body.phone ?? null,
      adultGuardian: body.adultGuardian,
      consent: {
        accepted: body.consent,
        policyVersion: body.policyVersion,
        ipHash: hashIp(clientIp(req)),
        userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
    return json(result, { status: 201 });
  } catch (e) {
    if (e instanceof Unauthorized) return fail(401, "UNAUTHORIZED", "Please verify your email first.");
    return handleError(e);
  }
}
