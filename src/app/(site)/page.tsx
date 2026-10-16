import Hero from "@/components/home/Hero";
import Marquee from "@/components/home/Marquee";
import HowItWorks from "@/components/home/HowItWorks";
import Demo from "@/components/home/Demo";
import Different from "@/components/home/Different";
import Pricing from "@/components/home/Pricing";
import Safety from "@/components/home/Safety";
import CTA from "@/components/home/CTA";

export default function HomePage() {
  return (
    <main id="main" className="flex-1">
      <Hero />
      <Marquee />
      <HowItWorks />
      <Demo />
      <Different />
      <Pricing />
      <Safety />
      <CTA />
    </main>
  );
}
