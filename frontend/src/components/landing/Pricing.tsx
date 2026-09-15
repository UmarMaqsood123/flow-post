import { Check } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { pricingPlans } from "@/config/landing";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import Container from "./Container";
import SectionHeading from "./SectionHeading";

function Pricing() {
  const { data: user } = useSession();

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="scroll-mt-16 border-y border-line bg-slate-50/70 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          id="pricing-heading"
          eyebrow="Pricing"
          title="Simple pricing that grows with you"
          description="Start free. Upgrade when you need more accounts and AI-generated posts."
        />

        <ul className="mx-auto mt-14 grid max-w-md gap-6 lg:max-w-none lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <li
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-surface p-7",
                plan.highlighted
                  ? "border-primary shadow-xl ring-1 shadow-primary/10 ring-primary"
                  : "border-line",
              )}
            >
              {plan.highlighted && (
                <p className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </p>
              )}

              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-2 text-sm text-muted">{plan.description}</p>

              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${plan.price}</span>
                <span className="text-sm text-muted">/ month</span>
              </p>

              <Link
                to={user ? paths.dashboard : paths.signup}
                className={buttonStyles(plan.highlighted ? "primary" : "secondary", "mt-6 w-full")}
              >
                {user ? "Go to dashboard" : plan.cta}
              </Link>

              <ul className="mt-8 flex flex-col gap-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-sm text-muted">Prices in USD, billed monthly.</p>
      </Container>
    </section>
  );
}

export default Pricing;
