import Link from "next/link";
import { config } from "@/config";
import Logo from "./Logo";

const cols = [
  {
    title: "Panther",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/book", label: "Book a session" },
      { href: "/dashboard", label: "Parent dashboard" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/safety", label: "Safety & privacy" },
      { href: "/parent-notice", label: "What we collect (parent notice)" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

// Evaluated once at module load, so the prerendered shell stays stable.
const YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="mt-24 border-t-2 border-ink bg-cream">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <span className="display text-xl font-extrabold tracking-tight">{config.brand.name}</span>
          </div>
          <p className="mt-4 max-w-sm text-ink-soft">{config.brand.tagline} Live on Google Meet, with a recap and practice after every session.</p>
          <p className="mt-4 text-sm text-ink-soft">
            Questions?{" "}
            <a className="font-semibold text-red underline-offset-4 hover:underline" href={`mailto:${config.brand.supportEmail}`}>
              {config.brand.supportEmail}
            </a>
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="eyebrow">{c.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="rounded font-medium text-ink underline-offset-4 hover:text-red hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wrap flex flex-col gap-2 border-t border-line py-6 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <p>© {YEAR} {config.brand.name}. Made for kids in grades 2–4 and the grown-ups who love them.</p>
        <p>No ad trackers. No session recording. Cards handled by Stripe.</p>
      </div>
    </footer>
  );
}
