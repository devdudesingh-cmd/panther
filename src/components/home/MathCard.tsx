"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Panther from "@/components/mascot/Panther";
import { encouragements, makeProblem, nudges, seeded, type Problem } from "@/lib/math";
import { confettiBurst } from "./confetti";

const FIRST = makeProblem(seeded(7), 2); // stable first paint: no hydration mismatch

/**
 * The hero's "solve one" card. Tappable number tiles (phones) and keyboard
 * input (desktops). A right answer fires confetti, the cub cheers, and the
 * next problem slides in.
 */
export default function MathCard() {
  const [problem, setProblem] = useState<Problem>(FIRST);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "correct" | "wrong">("idle");
  const [message, setMessage] = useState("Tap the numbers, then check.");
  const [streak, setStreak] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const next = useCallback(() => {
    setProblem(makeProblem());
    setInput("");
    setStatus("idle");
    setMessage("Next one!");
  }, []);

  const check = useCallback(() => {
    if (!input) return;
    if (Number(input) === problem.answer) {
      setStatus("correct");
      setStreak((s) => s + 1);
      setMessage(encouragements[Math.floor(Math.random() * encouragements.length)]);
      const r = cardRef.current?.getBoundingClientRect();
      if (r) confettiBurst(r.left + r.width / 2, r.top + r.height * 0.35);
      timers.current.push(window.setTimeout(next, 1400));
    } else {
      setStatus("wrong");
      setStreak(0);
      setMessage(nudges[Math.floor(Math.random() * nudges.length)]);
      timers.current.push(window.setTimeout(() => setStatus("idle"), 500));
    }
  }, [input, problem.answer, next]);

  const press = (d: string) => {
    if (status === "correct") return;
    setInput((v) => (v.length >= 4 ? v : v === "0" ? d : v + d));
  };
  const back = () => setInput((v) => v.slice(0, -1));

  // Keyboard support when the card has focus.
  const onKey = (e: React.KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      back();
    } else if (e.key === "Enter") {
      e.preventDefault();
      check();
    }
  };

  const mood = status === "correct" ? "cheer" : input ? "think" : "idle";

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <Panther mood={mood} className="absolute -top-[26%] left-1/2 w-[62%] -translate-x-1/2 drop-shadow-[0_18px_30px_rgba(27,14,14,0.25)] sm:-top-[30%] sm:w-[58%]" />

      <div
        ref={cardRef}
        tabIndex={0}
        onKeyDown={onKey}
        role="group"
        aria-label="Try a quick math problem"
        className={`card relative mt-[34%] rotate-[-1.5deg] p-5 pt-10 transition-transform duration-300 sm:p-6 sm:pt-12 ${
          status === "wrong" ? "animate-[shake_.4s_ease-in-out]" : ""
        } ${status === "correct" ? "rotate-0 scale-[1.02]" : ""}`}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow">Quick! Grade {problem.grade}</span>
          <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-ink-soft" aria-label={`Streak: ${streak}`}>
            {streak > 0 ? `🔥 ${streak} in a row` : "Give it a go"}
          </span>
        </div>

        <div className="display mt-3 flex items-baseline justify-center gap-3 text-[2.6rem] font-extrabold leading-none tracking-tight sm:text-5xl" aria-live="off">
          <span>{problem.prompt}</span>
          <span className="text-red">=</span>
          <span
            className={`inline-flex min-w-[2.2ch] justify-center rounded-2xl border-2 border-dashed px-2 py-1 transition-colors ${
              status === "correct" ? "border-mint bg-mint text-ink" : status === "wrong" ? "border-red bg-blush" : "border-ink/30 bg-cream"
            }`}
            aria-label={input ? `Your answer: ${input}` : "Your answer"}
          >
            {input || <span className="text-ink/25">?</span>}
          </span>
        </div>

        <p className="mt-3 min-h-6 text-center text-sm font-semibold text-ink-soft" role="status" aria-live="polite">
          {message}
        </p>

        <div className="mt-4 grid grid-cols-6 gap-2 sm:gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className="display aspect-square min-h-11 rounded-xl border-2 border-ink bg-white text-xl font-bold shadow-sticker transition-transform active:translate-y-[2px] active:shadow-none hover:-translate-y-0.5"
              aria-label={`Enter ${d}`}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={back}
            className="display aspect-square min-h-11 rounded-xl border-2 border-ink bg-cream text-lg font-bold shadow-sticker transition-transform active:translate-y-[2px] active:shadow-none"
            aria-label="Delete last digit"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={check}
            disabled={!input || status === "correct"}
            className="btn btn-primary aspect-square min-h-11 rounded-xl px-0 text-lg disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Check answer"
          >
            ✓
          </button>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-ink-soft">Keyboard works too: type a number and press Enter.</p>
      </div>
    </div>
  );
}
