"use client";

import { useEffect } from "react";

/**
 * Scroll-triggered reveals for anything marked `data-reveal`.
 * Variants: "up" (default), "fade", "scale", "left", "right". Add
 * `data-reveal-stagger` on a parent to stagger its direct children.
 *
 * Elements start visible in the HTML (no layout shift, no blank page without
 * JS); GSAP sets the "from" state only once it's running. Reduced motion →
 * nothing moves.
 */
export default function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const from = (variant: string | null) => {
          switch (variant) {
            case "fade":
              return { opacity: 0 };
            case "scale":
              return { opacity: 0, scale: 0.9 };
            case "left":
              return { opacity: 0, x: -40 };
            case "right":
              return { opacity: 0, x: 40 };
            default:
              return { opacity: 0, y: 40 };
          }
        };

        document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-reveal-stagger] > *)").forEach((el) => {
          gsap.fromTo(el, from(el.dataset.reveal || null), {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            duration: 0.9,
            ease: "expo.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
        });

        document.querySelectorAll<HTMLElement>("[data-reveal-stagger]").forEach((group) => {
          const kids = Array.from(group.children) as HTMLElement[];
          gsap.fromTo(kids, from(group.dataset.reveal || null), {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            duration: 0.8,
            ease: "expo.out",
            stagger: 0.08,
            scrollTrigger: { trigger: group, start: "top 85%", once: true },
          });
        });
      });
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return null;
}
