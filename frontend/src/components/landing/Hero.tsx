import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import Container from "./Container";
import ProductMockup from "./ProductMockup";

const GRID_BACKGROUND = {
  backgroundImage:
    "linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)",
  backgroundSize: "48px 48px",
  maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 100%)",
  WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 100%)",
};

const highlights = ["Nothing publishes without your review", "Five platforms, one calendar"];

function Hero() {
  const { data: user } = useSession();

  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-70" style={GRID_BACKGROUND} />
        <div className="absolute -top-48 right-[-10%] size-[520px] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-40 -left-40 size-[380px] rounded-full bg-violet-300/20 blur-3xl" />
      </div>

      <Container className="grid items-center gap-16 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:pt-24 lg:pb-28">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-surface/80 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            AI social media manager
          </p>

          <h1
            id="hero-heading"
            className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Turn one idea into a week of social posts
          </h1>

          <p className="mt-6 text-lg text-pretty text-muted">
            FlowPost drafts platform-ready posts for LinkedIn, Instagram, Facebook, TikTok and
            YouTube, then schedules them on a single calendar. You stay in control of every word.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={user ? paths.dashboard : paths.signup}
              className={buttonStyles("primary", "px-6 py-3 text-base shadow-sm shadow-primary/25")}
            >
              {user ? "Go to dashboard" : "Start free"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className={buttonStyles("secondary", "px-6 py-3 text-base")}>
              See how it works
            </a>
          </div>

          <ul className="mt-8 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <ProductMockup />
      </Container>
    </section>
  );
}

export default Hero;
