import Link from "next/link";
import { config } from "@/config";
import Logo from "./Logo";

const nav = [
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/safety", label: "Safety" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink/0 bg-paper/85 backdrop-blur-md transition-colors [&:has(+main)]:border-ink/0">
      <div className="wrap flex h-16 items-center justify-between gap-4 sm:h-[72px]">
        <Link href="/" className="flex items-center gap-2.5 rounded-full py-1 pr-2" aria-label={`${config.brand.name} home`}>
          <Logo className="h-9 w-9" />
          <span className="display text-xl font-extrabold tracking-tight">{config.brand.name}</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="btn btn-quiet min-h-10 px-4 text-[15px]">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn btn-quiet hidden min-h-10 px-4 text-[15px] sm:inline-flex">
            Parent login
          </Link>
          <Link href="/book" className="btn btn-primary min-h-11 px-5 text-[15px] sm:min-h-12 sm:px-6">
            {config.sessions.freeTrialEnabled ? "Book free trial" : "Book a session"}
          </Link>
        </div>
      </div>
    </header>
  );
}
