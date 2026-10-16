import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingError } from "@/lib/errors";
import { currentUser } from "@/lib/supabase/server";

/** Small helpers shared by the route handlers. */

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Map any thrown error to a response; BookingErrors are safe to show parents. */
export function handleError(e: unknown): NextResponse {
  if (e instanceof BookingError) return fail(e.status, e.code, e.message);
  if (e instanceof z.ZodError) return fail(400, "INVALID", e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  console.error("[api]", e);
  return fail(500, "INTERNAL", "Something went wrong on our side. Please try again.");
}

export class Unauthorized extends Error {}

/** The signed-in parent, or throws (→ 401). */
export async function requireUser() {
  const user = await currentUser();
  if (!user?.email) throw new Unauthorized();
  return { id: user.id, email: user.email };
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Admin check — only the configured account(s). */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) throw new BookingError("FORBIDDEN");
  return user;
}

/** Bearer-token check for machine callers (cron, tutor agent). Constant-time compare. */
export function bearerMatches(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export function clientIp(req: Request): string | null {
  return req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => null);
  return schema.parse(body);
}
