"use client";

import { useEffect, useRef } from "react";

/**
 * The Panther cub. Original SVG; every moving part is its own group so it can
 * blink (CSS), follow the cursor with its eyes (JS, pointer devices only) and
 * cheer (a `data-mood="cheer"` attribute toggles the pose).
 *
 * `mood`: "idle" | "cheer" | "think"
 */
export default function Panther({
  className = "",
  mood = "idle",
  followCursor = true,
  title = "Panther, the tutoring cub",
}: {
  className?: string;
  mood?: "idle" | "cheer" | "think";
  followCursor?: boolean;
  title?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!followCursor) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const svg = ref.current;
    if (!svg) return;
    const pupils = svg.querySelectorAll<SVGElement>("[data-pupil]");
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.42);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 400);
      tx = (dx / dist) * 5 * k;
      ty = (dy / dist) * 4 * k;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      pupils.forEach((p) => p.setAttribute("transform", `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [followCursor]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 240 240"
      className={`panther ${className}`}
      data-mood={mood}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* tail */}
      <g className="panther-tail" style={{ transformOrigin: "60px 190px" }}>
        <path d="M62 188c-30 6-52-14-44-40 4-13 20-18 28-9" fill="none" stroke="#1B0E0E" strokeWidth="14" strokeLinecap="round" />
        <path d="M62 188c-30 6-52-14-44-40 4-13 20-18 28-9" fill="none" stroke="#2B1A1A" strokeWidth="8" strokeLinecap="round" />
      </g>
      {/* body */}
      <ellipse cx="124" cy="178" rx="62" ry="46" fill="#1B0E0E" />
      <ellipse cx="124" cy="190" rx="34" ry="24" fill="#2B1A1A" />
      {/* paws */}
      <g className="panther-paws">
        <ellipse cx="92" cy="216" rx="18" ry="12" fill="#1B0E0E" />
        <ellipse cx="156" cy="216" rx="18" ry="12" fill="#1B0E0E" />
        <path d="M84 216h4M92 216h4M100 216h4M148 216h4M156 216h4M164 216h4" stroke="#2B1A1A" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* ears */}
      <g className="panther-ear panther-ear-l" style={{ transformOrigin: "74px 72px" }}>
        <path d="M58 86 L70 40 L104 70 Z" fill="#1B0E0E" />
        <path d="M68 78 L74 54 L92 70 Z" fill="#FF5A62" />
      </g>
      <g className="panther-ear panther-ear-r" style={{ transformOrigin: "166px 72px" }}>
        <path d="M182 86 L170 40 L136 70 Z" fill="#1B0E0E" />
        <path d="M172 78 L166 54 L148 70 Z" fill="#FF5A62" />
      </g>
      {/* head */}
      <ellipse cx="120" cy="110" rx="66" ry="56" fill="#1B0E0E" />
      {/* headset band */}
      <path d="M62 108c0-34 26-56 58-56s58 22 58 56" fill="none" stroke="#D6111E" strokeWidth="9" strokeLinecap="round" />
      <rect x="52" y="98" width="18" height="30" rx="8" fill="#D6111E" />
      <rect x="170" y="98" width="18" height="30" rx="8" fill="#D6111E" />
      <path d="M68 126c-8 20 4 34 30 36" fill="none" stroke="#D6111E" strokeWidth="6" strokeLinecap="round" />
      <circle cx="100" cy="163" r="6" fill="#D6111E" />
      {/* muzzle */}
      <ellipse cx="120" cy="130" rx="30" ry="20" fill="#2B1A1A" />
      {/* eyes */}
      <g className="panther-eyes">
        <g className="panther-eye" style={{ transformOrigin: "96px 104px" }}>
          <ellipse cx="96" cy="104" rx="14" ry="16" fill="#FFF8F2" />
          <g data-pupil>
            <circle cx="98" cy="106" r="7.5" fill="#1B0E0E" />
            <circle cx="101" cy="102" r="2.6" fill="#FFF8F2" />
          </g>
        </g>
        <g className="panther-eye" style={{ transformOrigin: "144px 104px" }}>
          <ellipse cx="144" cy="104" rx="14" ry="16" fill="#FFF8F2" />
          <g data-pupil>
            <circle cx="146" cy="106" r="7.5" fill="#1B0E0E" />
            <circle cx="149" cy="102" r="2.6" fill="#FFF8F2" />
          </g>
        </g>
      </g>
      {/* nose + mouth */}
      <path d="M112 124q8-6 16 0q-2 8-8 10q-6-2-8-10z" fill="#FF5A62" />
      <g className="panther-mouth">
        <path className="panther-mouth-idle" d="M108 138q12 10 24 0" fill="none" stroke="#FFF8F2" strokeWidth="3.5" strokeLinecap="round" />
        <path className="panther-mouth-cheer" d="M104 136q16 20 32 0 q-16 8-32 0z" fill="#FF5A62" stroke="#FFF8F2" strokeWidth="2.5" strokeLinejoin="round" />
      </g>
      {/* whiskers */}
      <path d="M78 128h18M78 136h16M144 128h18M146 136h16" stroke="#FFF8F2" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      {/* cheer sparkles */}
      <g className="panther-sparkles" fill="#FFD166">
        <path d="M40 60l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <path d="M196 40l2.5 6.5 6.5 2.5-6.5 2.5-2.5 6.5-2.5-6.5-6.5-2.5 6.5-2.5z" />
        <path d="M206 120l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      </g>
    </svg>
  );
}
