"use client";

import { useEffect } from "react";
import { loadGsap, prefersReducedMotion } from "@/components/motion/gsap";

/**
 * Scroll choreography for "How it works": the red path draws as you scroll
 * through the steps, dots fill in, the big numeral flips, and the current step
 * card lights up. Desktop only (the sticky column is hidden on phones).
 */
export default function HowItWorksMotion() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const { gsap, ScrollTrigger } = await loadGsap();
      if (cancelled) return;
      const root = document.querySelector<HTMLElement>("[data-how]");
      if (!root) return;

      ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add("(min-width: 768px)", () => {
          const path = root.querySelector<SVGPathElement>("[data-how-path]");
          const dots = Array.from(root.querySelectorAll<SVGCircleElement>("[data-how-dot]"));
          const num = root.querySelector<HTMLElement>("[data-how-num]");
          const stepEls = Array.from(root.querySelectorAll<HTMLElement>("[data-how-step]"));

          if (path) {
            gsap.to(path, {
              strokeDashoffset: 0,
              ease: "none",
              scrollTrigger: { trigger: root, start: "top 60%", end: "bottom 70%", scrub: 0.6 },
            });
          }

          stepEls.forEach((el, i) => {
            ScrollTrigger.create({
              trigger: el,
              start: "top 62%",
              end: "bottom 62%",
              onToggle: (self) => {
                el.dataset.active = String(self.isActive);
                if (self.isActive) {
                  if (num && num.textContent !== String(i + 1).padStart(2, "0")) {
                    gsap.fromTo(num, { yPercent: 30, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "expo.out" });
                    num.textContent = String(i + 1).padStart(2, "0");
                  }
                  dots.forEach((d, j) => gsap.to(d, { fill: j <= i ? "#D6111E" : "#FFF8F2", duration: 0.3 }));
                }
              },
            });
          });
        });
      }, root);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return null;
}
