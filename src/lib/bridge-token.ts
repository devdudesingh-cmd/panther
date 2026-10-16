import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived, signed tokens that let the Recall bot's browser (/bridge) and
 * the frames service prove which session they belong to, without a login.
 * Format: <expiresAtSeconds>.<base64url hmac(sessionId.expires)>
 */
function secret(): string {
  const s = process.env.FRAMES_WS_SECRET || process.env.AGENT_API_KEY;
  if (!s) throw new Error("FRAMES_WS_SECRET (or AGENT_API_KEY) must be set to sign bridge tokens.");
  return s;
}

export function signBridgeToken(sessionId: string, ttlSeconds = 6 * 3600, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const mac = createHmac("sha256", secret()).update(`${sessionId}.${exp}`).digest("base64url");
  return `${exp}.${mac}`;
}

export function verifyBridgeToken(sessionId: string, token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !mac) return false;
  if (exp * 1000 < now) return false;
  const expected = createHmac("sha256", secret()).update(`${sessionId}.${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
