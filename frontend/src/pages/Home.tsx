import CtaBand from "@/components/landing/CtaBand";
import Faq from "@/components/landing/Faq";
import Features from "@/components/landing/Features";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import PlatformStrip from "@/components/landing/PlatformStrip";
import Pricing from "@/components/landing/Pricing";
import Showcase from "@/components/landing/Showcase";

/** Public landing page. Copy and data live in src/config/landing.ts. */
function Home() {
  return (
    <>
      <Hero />
      <PlatformStrip />
      <Features />
      <HowItWorks />
      <Showcase />
      <Pricing />
      <Faq />
      <CtaBand />
    </>
  );
}

export default Home;
