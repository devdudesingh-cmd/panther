/** Placeholder mark until the real logo lands: a red sticker with the cub's ears. */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="14" fill="#D6111E" stroke="#1B0E0E" strokeWidth="2.5" />
      <path d="M13 30 L17 15 L25 24 Z" fill="#1B0E0E" />
      <path d="M35 30 L31 15 L23 24 Z" fill="#1B0E0E" />
      <ellipse cx="24" cy="31" rx="12" ry="9" fill="#1B0E0E" />
      <circle cx="19.5" cy="30" r="2.4" fill="#FFF8F2" />
      <circle cx="28.5" cy="30" r="2.4" fill="#FFF8F2" />
      <path d="M22.5 34.5q1.5 1.5 3 0" stroke="#FFF8F2" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
