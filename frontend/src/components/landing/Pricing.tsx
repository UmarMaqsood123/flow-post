import { Check } from "lucide-react";
import { Link } from "react-router";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import Skeleton from "@/components/ui/Skeleton";
import { highlightedPlan, planMarketing } from "@/config/landing";
import { planFeatureList } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import { usePlans } from "@/services/billing/useBilling";
import Container from "./Container";
import SectionHeading from "./SectionHeading";

const GRID = "mx-auto mt-14 grid max-w-md gap-6 md:max-w-none md:grid-cols-2 xl:grid-cols-4";

function Pricing() {
  const { data: user } = useSession();
  const plans = usePlans();

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
          title="Simple pricing"
          description="Start free. Upgrade when you need more accounts, posts or people on your team."
        />

        {plans.isPending ? (
          <div className={GRID} aria-busy="true" aria-label="Loading plans">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[34rem] rounded-2xl" />
            ))}
          </div>
        ) : plans.isError ? (
          <div className="mx-auto mt-14 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-medium">We couldn&apos;t load our plans right now.</p>
            <p className="mt-2 text-sm text-muted">
              You can still start on the free plan and upgrade any time from Billing.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => void plans.refetch()}>
                Try again
              </Button>
              <Link to={user ? paths.billing : paths.signup} className={buttonStyles("primary")}>
                {user ? "Go to billing" : "Start free"}
              </Link>
            </div>
          </div>
        ) : (
          <ul className={GRID}>
            {plans.data.map((option) => {
              const highlighted = option.plan === highlightedPlan;
              const marketing = planMarketing[option.plan];
              return (
                <li
                  key={option.plan}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-surface p-7",
                    highlighted
                      ? "border-primary shadow-xl ring-1 shadow-primary/10 ring-primary"
                      : "border-line",
                  )}
                >
                  {highlighted && (
                    <p className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                      Most popular
                    </p>
                  )}

                  <h3 className="text-lg font-semibold">{option.label}</h3>
                  <p className="mt-2 min-h-10 text-sm text-muted">{marketing.description}</p>

                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">
                      ${option.priceMonthlyUsd}
                    </span>
                    <span className="text-sm text-muted">/ month</span>
                  </p>

                  <Link
                    to={
                      !user
                        ? paths.signup
                        : option.plan === "FREE"
                          ? paths.dashboard
                          : paths.billing
                    }
                    className={buttonStyles(highlighted ? "primary" : "secondary", "mt-6 w-full")}
                  >
                    {user
                      ? option.plan === "FREE"
                        ? "Go to dashboard"
                        : "Choose in Billing"
                      : marketing.cta}
                  </Link>

                  <ul className="mt-8 flex flex-col gap-3 text-sm">
                    {planFeatureList(option).map((feature) => (
                      <li key={feature} className="flex gap-3">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-center text-sm text-muted">
          Prices in USD, billed monthly. Checkout shows the exact amount, including any tax.
        </p>
      </Container>
    </section>
  );
}

export default Pricing;
