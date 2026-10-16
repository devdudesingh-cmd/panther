"use client";

import { useEffect, useRef } from "react";
import { loadGsap, prefersReducedMotion } from "@/components/motion/gsap";

/**
 * Kinetic headline: the text is in the HTML from the first byte (LCP, SEO,
 * no JS needed). Once fonts are ready, SplitText masks each line and the
 * characters rise in with a stagger. Reduced motion → text just sits there.
 */
export default function HeroTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    let revert: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { gsap, SplitText } = await loadGsap();
      await document.fonts.ready;
      if (cancelled) return;
      // "words" keeps each word unbreakable while its chars animate.
      const split = SplitText.create(el, { type: "lines, words, chars", mask: "lines", linesClass: "hero-line", charsClass: "hero-char" });
      gsap.set(el, { visibility: "visible" });
      const tl = gsap.timeline();
      tl.from(split.chars, {
        yPercent: 110,
        rotate: 6,
        opacity: 0,
        duration: 0.9,
        ease: "expo.out",
        stagger: { each: 0.018, from: "start" },
      });
      tl.fromTo(".hero-after", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: "expo.out", stagger: 0.12 }, "-=0.5");
      revert = () => {
        tl.kill();
        split.revert();
      };
    })();

    return () => {
      cancelled = true;
      revert?.();
    };
  }, []);

  return (
    <h1 ref={ref} className={className}>
      {children}
    </h1>
  );
}
