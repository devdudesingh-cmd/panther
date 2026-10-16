import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { config } from "@/config";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${config.brand.name} — ${config.brand.tagline}`,
    template: `%s · ${config.brand.name}`,
  },
  description:
    "Live, one-on-one math help for kids in grades 2–4. A Panther tutor joins your Google Meet. First 25-minute session is free.",
  openGraph: {
    type: "website",
    siteName: config.brand.name,
    title: `${config.brand.name} — ${config.brand.tagline}`,
    description: "Live, one-on-one math help for kids in grades 2–4. First session free.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: config.brand.colors.paper,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <html lang="en" className={`${bricolage.variable} ${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only-focusable btn btn-primary fixed top-3 left-3 z-[100]">
          Skip to content
        </a>
        {children}
        {plausible ? (
          // Privacy-friendly, cookie-less analytics. No ad trackers, no session replay.
          <script defer data-domain={plausible} src="https://plausible.io/js/script.js" />
        ) : null}
      </body>
    </html>
  );
}
