"use client";

import { useState } from "react";
import Panther from "@/components/mascot/Panther";
import { confettiBurst } from "@/components/home/confetti";
import type { PracticeItem } from "@/lib/db/types";

export default function PracticeList({ items }: { items: PracticeItem[] }) {
  const [answers, setAnswers] = useState<string[]>(() => items.map(() => ""));
  const [result, setResult] = useState<("" | "right" | "wrong")[]>(() => items.map(() => ""));
  const [hints, setHints] = useState<boolean[]>(() => items.map(() => false));
  const done = result.filter((r) => r === "right").length;

  function check(i: number, e: React.FormEvent) {
    e.preventDefault();
    const ok = answers[i].trim().replace(/\s+/g, "").toLowerCase() === items[i].answer.trim().replace(/\s+/g, "").toLowerCase();
    setResult((r) => r.map((v, j) => (j === i ? (ok ? "right" : "wrong") : v)));
    if (ok) {
      const el = (e.target as HTMLElement).getBoundingClientRect();
      confettiBurst(el.left + el.width / 2, el.top + 20);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-3xl bg-cream p-4">
        <Panther mood={done === items.length ? "cheer" : "idle"} className="w-20 shrink-0" followCursor={false} />
        <div>
          <p className="display text-xl font-extrabold">
            {done === items.length ? "All done — amazing!" : `${done} of ${items.length} solved`}
          </p>
          <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
            <div className="h-full bg-red transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <ol className="space-y-4">
        {items.map((it, i) => (
          <li key={i}>
            <form onSubmit={(e) => check(i, e)} className={`card p-5 ${result[i] === "right" ? "bg-mint" : ""}`}>
              <label htmlFor={`q${i}`} className="display block text-2xl font-extrabold tracking-tight">
                {it.question}
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  id={`q${i}`}
                  className="field display max-w-[10rem] text-xl"
                  inputMode="decimal"
                  value={answers[i]}
                  onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  disabled={result[i] === "right"}
                  aria-describedby={`r${i}`}
                />
                <button type="submit" className="btn btn-primary min-h-12" disabled={!answers[i].trim() || result[i] === "right"}>
                  Check
                </button>
                {it.hint && result[i] !== "right" ? (
                  <button type="button" className="btn btn-quiet min-h-12" onClick={() => setHints((h) => h.map((v, j) => (j === i ? true : v)))}>
                    Hint
                  </button>
                ) : null}
              </div>
              <p id={`r${i}`} className="mt-2 min-h-5 text-sm font-semibold" role="status">
                {result[i] === "right" ? "Yes! Nailed it." : result[i] === "wrong" ? "Not yet — try again." : hints[i] && it.hint ? `Hint: ${it.hint}` : ""}
              </p>
            </form>
          </li>
        ))}
      </ol>
    </div>
  );
}
