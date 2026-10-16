import { beforeAll, describe, expect, it } from "vitest";
import { hashEmail, hashPhone, normalizeEmail, normalizePhone } from "@/lib/hash";

describe("email + phone normalization for trial claims", () => {
  beforeAll(() => {
    process.env.HASH_PEPPER = "unit-test-pepper";
  });

  it("collapses gmail dots and plus tags; keeps other domains' dots", () => {
    expect(normalizeEmail("First.Last+kid@Gmail.com ")).toBe("firstlast@gmail.com");
    expect(normalizeEmail("first.last@googlemail.com")).toBe("firstlast@gmail.com");
    expect(normalizeEmail("First.Last+tag@Outlook.com")).toBe("first.last@outlook.com");
  });

  it("hashes are stable, keyed, and 64 hex chars", () => {
    const a = hashEmail("First.Last+kid@gmail.com");
    expect(a).toBe(hashEmail("firstlast@gmail.com"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(hashEmail("other@gmail.com"));
  });

  it("phones normalize to digits with a US country code", () => {
    expect(normalizePhone("(555) 010-2030")).toBe("15550102030");
    expect(normalizePhone("+1 555 010 2030")).toBe("15550102030");
    expect(normalizePhone("12345")).toBeNull();
    expect(hashPhone("(555) 010-2030")).toBe(hashPhone("1-555-010-2030"));
  });
});
