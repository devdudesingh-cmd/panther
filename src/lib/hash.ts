import { createHmac, createHash } from "node:crypto";

/**
 * Normalize an email so trivial variants map to the same family:
 * lowercased, trimmed, and for Gmail/Googlemail the dots and "+tag" are
 * removed (they all deliver to the same inbox).
 */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  } else {
    local = local.split("+")[0];
  }
  return `${local}@${domain}`;
}

/** Digits only, with a leading country code assumed US when 10 digits. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

function pepper(): string {
  const p = process.env.HASH_PEPPER;
  if (!p) throw new Error("HASH_PEPPER is not set. See .env.example.");
  return p;
}

/** Keyed hash so a database leak doesn't expose emails. */
export function hashEmail(raw: string): string {
  return createHmac("sha256", pepper()).update(`email:${normalizeEmail(raw)}`).digest("hex");
}

export function hashPhone(raw: string): string | null {
  const n = normalizePhone(raw);
  return n ? createHmac("sha256", pepper()).update(`phone:${n}`).digest("hex") : null;
}

/** Unkeyed, truncated hash for IPs stored with consents (coarse audit trail only). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
