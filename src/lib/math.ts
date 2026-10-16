/**
 * Tiny grade-2–4 problem generator for the hero's "solve one" card.
 * Deterministic given a seeded RNG so tests are stable.
 */

export interface Problem {
  prompt: string;
  answer: number;
  grade: 2 | 3 | 4;
  kind: "add" | "sub" | "mul" | "div" | "missing";
}

export type Rng = () => number;

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function makeProblem(rng: Rng = Math.random, grade?: 2 | 3 | 4): Problem {
  const g = grade ?? ([2, 3, 4] as const)[int(rng, 0, 2)];
  const pick = rng();

  if (g === 2) {
    if (pick < 0.5) {
      const a = int(rng, 3, 19);
      const b = int(rng, 2, 20 - Math.min(a, 10));
      return { prompt: `${a} + ${b}`, answer: a + b, grade: 2, kind: "add" };
    }
    if (pick < 0.85) {
      const a = int(rng, 8, 20);
      const b = int(rng, 1, a - 1);
      return { prompt: `${a} − ${b}`, answer: a - b, grade: 2, kind: "sub" };
    }
    const a = int(rng, 2, 9);
    const sum = a + int(rng, 1, 9);
    return { prompt: `${a} + ? = ${sum}`, answer: sum - a, grade: 2, kind: "missing" };
  }

  if (g === 3) {
    if (pick < 0.55) {
      const a = int(rng, 2, 9);
      const b = int(rng, 2, 9);
      return { prompt: `${a} × ${b}`, answer: a * b, grade: 3, kind: "mul" };
    }
    if (pick < 0.8) {
      const a = int(rng, 12, 99);
      const b = int(rng, 11, 99);
      return { prompt: `${a} + ${b}`, answer: a + b, grade: 3, kind: "add" };
    }
    const b = int(rng, 2, 9);
    const q = int(rng, 2, 9);
    return { prompt: `${b * q} ÷ ${b}`, answer: q, grade: 3, kind: "div" };
  }

  if (pick < 0.4) {
    const a = int(rng, 3, 12);
    const b = int(rng, 3, 12);
    return { prompt: `${a} × ${b}`, answer: a * b, grade: 4, kind: "mul" };
  }
  if (pick < 0.7) {
    const b = int(rng, 3, 12);
    const q = int(rng, 3, 12);
    return { prompt: `${b * q} ÷ ${b}`, answer: q, grade: 4, kind: "div" };
  }
  const a = int(rng, 120, 999);
  const b = int(rng, 20, a - 20);
  return { prompt: `${a} − ${b}`, answer: a - b, grade: 4, kind: "sub" };
}

/** Mulberry32 — small seeded RNG for tests and stable first paint. */
export function seeded(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const encouragements = [
  "Yes! That's it.",
  "Nailed it.",
  "Boom — correct!",
  "You've got this.",
  "Perfect. One more?",
  "That was quick!",
];

export const nudges = ["Close! Try once more.", "Not quite — take another look.", "Hmm, check that again."];
