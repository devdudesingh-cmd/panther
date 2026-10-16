import type { ReactNode } from "react";

/** Header + readable column for content/legal pages. */
export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="wrap pb-12 pt-10 md:pb-16 md:pt-16">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="text-display-lg mt-4 max-w-4xl">{title}</h1>
      {lede ? <p className="mt-6 max-w-2xl text-lg text-ink-soft sm:text-xl">{lede}</p> : null}
    </header>
  );
}

export function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="wrap">
      <article className={`prose-panther max-w-3xl ${className}`}>{children}</article>
    </div>
  );
}
