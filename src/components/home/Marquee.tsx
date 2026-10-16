import { config } from "@/config";

/** Topic ticker. Pure CSS animation, duplicated content for a seamless loop. */
export default function Marquee() {
  const items = [...config.sessions.topics, "Skip counting", "Number lines", "Arrays", "Rounding"];
  const row = [...items, ...items];
  return (
    <div className="relative -rotate-1 border-y-2 border-ink bg-red py-3 text-white" aria-label="Topics we help with">
      <div className="mask-fade-x overflow-hidden">
        <ul className="flex w-max animate-marquee gap-10 whitespace-nowrap motion-reduce:animate-none" aria-hidden="true">
          {row.map((t, i) => (
            <li key={i} className="display flex items-center gap-10 text-lg font-bold tracking-tight sm:text-xl">
              {t}
              <span className="inline-block h-2.5 w-2.5 rotate-45 bg-sun" />
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">{items.join(", ")}</p>
    </div>
  );
}
