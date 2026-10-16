import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Reveal from "@/components/motion/Reveal";
import "@/components/mascot/panther.css";

/** Marketing + content pages: shared chrome and the motion layer. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      {children}
      <Footer />
      <SmoothScroll />
      <Reveal />
    </>
  );
}
