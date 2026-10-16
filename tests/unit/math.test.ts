import { describe, expect, it } from "vitest";
import { makeProblem, seeded } from "@/lib/math";

describe("hero math problems", () => {
  it("is deterministic with a seed and stays in grade range", () => {
    const a = makeProblem(seeded(7), 2);
    const b = makeProblem(seeded(7), 2);
    expect(a).toEqual(b);
    expect(a.grade).toBe(2);
  });

  it("every grade produces whole, non-negative answers kids can key in", () => {
    const rng = seeded(42);
    for (let i = 0; i < 2000; i++) {
      const p = makeProblem(rng);
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThanOrEqual(9999);
      if (p.grade === 2) expect(p.answer).toBeLessThanOrEqual(40);
      if (p.kind === "div") expect(p.prompt).toMatch(/÷/);
    }
  });
});
