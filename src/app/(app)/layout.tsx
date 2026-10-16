import Link from "next/link";
import Header from "@/components/site/Header";
import { config } from "@/config";
import "@/components/mascot/panther.css";

/** Signed-in area: same header, quieter footer, native scrolling. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      {children}
      <footer className="mt-16 border-t border-line py-8 text-sm text-ink-soft">
        <div className="wrap flex flex-wrap items-center justify-between gap-3">
          <p>
            Need a hand?{" "}
            <a className="font-semibold text-red underline-offset-4 hover:underline" href={`mailto:${config.brand.supportEmail}`}>
              {config.brand.supportEmail}
            </a>
          </p>
          <p className="flex gap-4">
            <Link href="/safety" className="hover:text-red">
              Safety &amp; privacy
            </Link>
            <Link href="/terms" className="hover:text-red">
              Terms
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
