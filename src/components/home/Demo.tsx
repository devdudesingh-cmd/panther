"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "What a session sounds like": a waveform player with timed captions.
 * Plays /demo/tutor-demo.mp3 when present; without the file it still runs
 * the captions on a timer so the section never looks broken. Clearly
 * labelled as an illustrative transcript.
 */
const script: { t: number; who: "tutor" | "kid"; text: string }[] = [
  { t: 0, who: "tutor", text: "Hey Maya! Ready to figure out 7 × 8?" },
  { t: 3.2, who: "kid", text: "Umm… I always forget that one." },
  { t: 5.8, who: "tutor", text: "Totally normal — lots of people do. Do you know 7 × 4?" },
  { t: 9.4, who: "kid", text: "28!" },
  { t: 10.6, who: "tutor", text: "Yes! And 7 × 8 is just 7 × 4, twice. So… 28 plus 28?" },
  { t: 15.2, who: "kid", text: "…56!" },
  { t: 16.6, who: "tutor", text: "56. You just built your own shortcut. Want to try 6 × 8 the same way?" },
];
const DURATION = 21;

const BARS = Array.from({ length: 48 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)));

export default function Demo() {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [hasAudio, setHasAudio] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeFrom = useRef(0);

  // Captions-only clock, used when there's no audio file to follow.
  useEffect(() => {
    if (!playing || hasAudio) return;
    const started = performance.now() - resumeFrom.current * 1000;
    let raf = 0;
    const step = () => {
      const t = (performance.now() - started) / 1000;
      if (t >= DURATION) {
        setTime(DURATION);
        setPlaying(false);
        return;
      }
      setTime(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, hasAudio]);

  const toggle = async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const from = time >= DURATION ? 0 : time;
    resumeFrom.current = from;
    setTime(from);
    const audio = audioRef.current;
    if (hasAudio && audio) {
      try {
        audio.currentTime = from;
        await audio.play();
        setPlaying(true);
        return;
      } catch {
        setHasAudio(false);
      }
    }
    setPlaying(true);
  };

  const current = script.filter((l) => l.t <= time).at(-1);
  const progress = Math.min(1, time / DURATION);

  return (
    <section className="wrap py-24 md:py-32" aria-labelledby="demo-title">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <div data-reveal>
          <p className="eyebrow">Hear the difference</p>
          <h2 id="demo-title" className="text-display-lg mt-4">
            Patient. Playful. <span className="text-red">Never</span> rushed.
          </h2>
          <p className="mt-6 text-lg text-ink-soft">
            Kids don&apos;t need the answer — they need the next small step. Panther tutors ask, wait, and build on what your
            kid already knows, so the win is theirs.
          </p>
          <p className="mt-4 text-sm text-ink-faint">Illustrative transcript of a typical exchange.</p>
        </div>

        <div className="card p-6 sm:p-8" data-reveal="scale">
          <audio
            ref={audioRef}
            preload="none"
            src="/demo/tutor-demo.mp3"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onEnded={() => setPlaying(false)}
            onError={() => setHasAudio(false)}
          />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggle}
              className="btn btn-primary h-16 w-16 shrink-0 rounded-full p-0 text-2xl"
              aria-label={playing ? "Pause demo" : "Play demo"}
              aria-pressed={playing}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <div className="flex h-16 flex-1 items-center gap-[3px]" aria-hidden="true">
              {BARS.map((h, i) => {
                const active = i / BARS.length <= progress;
                return (
                  <span
                    key={i}
                    className={`block w-1.5 flex-1 rounded-full transition-colors ${active ? "bg-red" : "bg-line"} ${playing && active ? "animate-[bar_.9s_ease-in-out_infinite_alternate]" : ""}`}
                    style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${(i % 7) * 60}ms` }}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-6 min-h-[7.5rem] rounded-2xl bg-cream p-5" aria-live="polite">
            {current ? (
              <div key={current.t} className="animate-[rise_.4s_var(--ease-out-expo)]">
                <span className={`eyebrow ${current.who === "kid" ? "text-ink-soft" : ""}`}>{current.who === "tutor" ? "Tutor" : "Maya, grade 3"}</span>
                <p className="display mt-2 text-xl font-bold leading-snug tracking-tight sm:text-2xl">{current.text}</p>
              </div>
            ) : (
              <p className="text-ink-soft">Press play to follow along.</p>
            )}
          </div>
          <ol className="sr-only">
            {script.map((l) => (
              <li key={l.t}>
                {l.who === "tutor" ? "Tutor" : "Maya"}: {l.text}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
