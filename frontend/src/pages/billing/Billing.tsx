import toast from "react-hot-toast";
import { Check, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import UsageMeter from "@/components/billing/UsageMeter";
import { ConfirmModal } from "@/components/modals";
import AsyncContent from "@/components/shared/AsyncContent";
import PageHeader from "@/components/shared/PageHeader";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { formatFileSize } from "@/lib/files";
import { cn } from "@/lib/utils";
import {
  useBilling,
  useBillingPortal,
  useCancelSubscription,
  useChangePlan,
  useCheckout,
  useConfirmCheckout,
  useRefreshBilling,
  useResumeSubscription,
} from "@/services/billing/useBilling";
import type {
  BillingInterval,
  BillingOverview,
  PaidPlan,
  Plan,
  PlanOption,
  SubscriptionStatus,
} from "@/types/billing";
import { notify } from "@/lib/toast";

const RANK: Record<Plan, number> = { FREE: 0, CREATOR: 1, PRO: 2, AGENCY: 3 };
/** Subscriptions that are still in place (or can still be fixed). */
const LIVE: SubscriptionStatus[] = ["active", "trialing", "past_due", "unpaid", "paused"];

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "the end of the period";

const STATUS_LABELS: Record<
  SubscriptionStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "success" },
  past_due: { label: "Payment overdue", tone: "warning" },
  unpaid: { label: "Unpaid", tone: "danger" },
  canceled: { label: "Canceled", tone: "neutral" },
  incomplete: { label: "Incomplete", tone: "warning" },
  incomplete_expired: { label: "Expired", tone: "neutral" },
  paused: { label: "Paused", tone: "warning" },
};

type PendingAction =
  { kind: "change"; plan: PaidPlan; interval: BillingInterval } | { kind: "cancel" } | null;

function PlanStatus({ overview }: { overview: BillingOverview }) {
  const { subscription, payment, planReason } = overview;
  const current = overview.plans.find((option) => option.plan === overview.plan);

  return (
    <div className="flex flex-col gap-3">
      {planReason === "grace_period" && (
        <Alert variant="warning" title="Your last payment didn't go through">
          {payment.error ?? "Stripe will try again."} Your plan stays active until{" "}
          {formatDate(payment.graceUntil)}. Update your payment method to keep it.
        </Alert>
      )}
      {planReason === "override" && (
        <Alert
          variant="info"
          title={`${current?.label ?? "This"} plan was granted to your account`}
        >
          {overview.planOverride?.expiresAt
            ? `It lasts until ${formatDate(overview.planOverride.expiresAt)}.`
            : "It stays in place until it's removed."}{" "}
          No payment is needed for it.
        </Alert>
      )}
      {planReason === "payment_overdue" && (
        <Alert variant="error" title="Your plan is paused for non-payment">
          Your account is on the Free plan until the payment is fixed. Nothing has been deleted.
        </Alert>
      )}
      {subscription?.cancelAtPeriodEnd && (
        <Alert variant="info" title="Your subscription is set to end">
          You keep {current?.label} until {formatDate(subscription.currentPeriodEnd)}, then move to
          Free.
        </Alert>
      )}
      {subscription?.scheduledChange && (
        <Alert variant="info" title="A plan change is booked">
          You'll move to{" "}
          {
            overview.plans.find((option) => option.plan === subscription.scheduledChange?.plan)
              ?.label
          }{" "}
          on {formatDate(subscription.scheduledChange.effectiveAt)}.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-2xl font-semibold">{current?.label ?? overview.plan}</p>
        {subscription && LIVE.includes(subscription.status) && (
          <Badge tone={STATUS_LABELS[subscription.status].tone}>
            {STATUS_LABELS[subscription.status].label}
          </Badge>
        )}
      </div>
      {subscription && LIVE.includes(subscription.status) && (
        <p className="text-sm text-muted">
          Billed {subscription.interval === "year" ? "yearly" : "monthly"}.{" "}
          {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
          {formatDate(subscription.currentPeriodEnd)}.
        </p>
      )}
    </div>
  );
}

function PlanCard({
  option,
  overview,
  interval,
  busy,
  onChoose,
}: {
  option: PlanOption;
  overview: BillingOverview;
  interval: BillingInterval;
  busy: boolean;
  onChoose: (option: PlanOption) => void;
}) {
  const { subscription } = overview;
  const hasLive = Boolean(subscription && LIVE.includes(subscription.status));
  const isCurrentPlan = option.plan === overview.plan;
  const isExactCurrent =
    hasLive && subscription?.plan === option.plan && subscription.interval === interval;
  const pendingElsewhere = Boolean(
    subscription?.cancelAtPeriodEnd || subscription?.scheduledChange,
  );
  const unavailable = option.plan !== "FREE" && !option.intervals.includes(interval);
  const blockedByPayment =
    hasLive && subscription?.status !== "active" && subscription?.status !== "trialing";

  let label: string;
  let disabled = busy || !overview.configured;
  if (option.plan === "FREE") {
    if (!hasLive || subscription?.cancelAtPeriodEnd) {
      label = isCurrentPlan ? "Current plan" : "Included";
      disabled = true;
    } else {
      label = "Downgrade to Free";
    }
  } else if (isExactCurrent && !pendingElsewhere) {
    label = "Current plan";
    disabled = true;
  } else if (isExactCurrent) {
    label = `Keep ${option.label}`;
  } else if (!hasLive) {
    label = `Choose ${option.label}`;
  } else {
    label =
      RANK[option.plan] > RANK[subscription?.plan ?? "FREE"] ||
      (option.plan === subscription?.plan && interval === "year")
        ? `Upgrade to ${option.label}`
        : `Switch to ${option.label}`;
  }
  if (unavailable || (blockedByPayment && option.plan !== "FREE")) disabled = true;

  const limits = option.limits;
  const features = [
    `${limits.workspaces} ${limits.workspaces === 1 ? "workspace" : "workspaces"}`,
    `${limits.socialAccountsPerWorkspace} social accounts per workspace`,
    `${limits.aiGenerationsPerMonth.toLocaleString()} AI generations a month`,
    `${limits.scheduledPostsPerMonth.toLocaleString()} scheduled posts a month`,
    `${limits.teamMembersPerWorkspace} ${limits.teamMembersPerWorkspace === 1 ? "seat" : "seats"} per workspace`,
    `${formatFileSize(limits.storageBytes)} media storage`,
    option.features.analytics ? "Analytics and AI insights" : null,
    option.features.autopilot
      ? `Autopilot, up to ${option.autopilot.postsPerWeek} posts a week`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-surface p-5",
        isCurrentPlan ? "border-primary ring-1 ring-primary/30" : "border-line",
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{option.label}</h3>
          {isCurrentPlan && <Badge tone="primary">Your plan</Badge>}
        </div>
        <p className="mt-2">
          <span className="text-3xl font-semibold tabular-nums">${option.priceMonthlyUsd}</span>
          <span className="text-sm text-muted"> / month</span>
        </p>
        {unavailable && (
          <p className="mt-1 text-xs text-muted">Not available with yearly billing.</p>
        )}
      </div>
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
      <Button
        variant={isCurrentPlan || option.plan === "FREE" ? "secondary" : "primary"}
        disabled={disabled}
        onClick={() => onChoose(option)}
      >
        {label}
      </Button>
    </article>
  );
}

function Billing() {
  const billing = useBilling();
  const refresh = useRefreshBilling();
  const confirm = useConfirmCheckout();
  const checkout = useCheckout();
  const change = useChangePlan();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const portal = useBillingPortal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [pending, setPending] = useState<PendingAction>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const confirmedSession = useRef<string | null>(null);

  const checkoutState = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");

  // Back from Stripe: ask the server to fetch the session from Stripe, rather than
  // trusting the redirect itself as proof of payment.
  useEffect(() => {
    if (!checkoutState || confirmedSession.current === (sessionId ?? checkoutState)) return;
    confirmedSession.current = sessionId ?? checkoutState;
    setSearchParams(
      (params) => {
        params.delete("checkout");
        params.delete("session_id");
        return params;
      },
      { replace: true },
    );
    if (checkoutState === "cancelled") {
      notify.info("Checkout was cancelled and you haven't been charged.", "checkout");
      return;
    }
    if (checkoutState !== "success" || !sessionId) return;
    toast.loading("Confirming your subscription…", { id: "checkout" });
    confirm.mutate(sessionId, {
      onSuccess: () =>
        notify.success(
          "Thanks for subscribing. Your new plan is active on all your workspaces.",
          "checkout",
        ),
      onError: () =>
        toast.error(
          "Payment went through, but we couldn't confirm it yet. It usually appears within a minute.",
          { id: "checkout" },
        ),
    });
  }, [checkoutState, sessionId, confirm, setSearchParams]);

  const data = billing.data;
  const busy =
    checkout.isPending ||
    change.isPending ||
    cancel.isPending ||
    resume.isPending ||
    portal.isPending;

  const choose = (option: PlanOption) => {
    if (!data) return;
    setWarnings([]);
    const hasLive = Boolean(data.subscription && LIVE.includes(data.subscription.status));
    if (option.plan === "FREE") {
      cancel.reset();
      setPending({ kind: "cancel" });
    } else if (!hasLive) {
      checkout.mutate({ plan: option.plan, interval }, { onError: (error) => notify.error(error) });
    } else {
      change.reset();
      setPending({ kind: "change", plan: option.plan, interval });
    }
  };

  const pendingOption =
    pending?.kind === "change" ? data?.plans.find((option) => option.plan === pending.plan) : null;
  const isUpgrade =
    pending?.kind === "change" &&
    data?.subscription &&
    (RANK[pending.plan] > RANK[data.subscription.plan ?? "FREE"] ||
      (pending.plan === data.subscription.plan && pending.interval === "year"));
  const isKeep =
    pending?.kind === "change" &&
    data?.subscription?.plan === pending.plan &&
    data.subscription.interval === pending.interval;

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Billing"
        description="Your plan covers every workspace you're the billing owner of."
        actions={
          data?.configured && (
            <>
              <Button
                variant="secondary"
                isLoading={refresh.isPending}
                onClick={() =>
                  refresh.mutate(undefined, {
                    onSuccess: () =>
                      notify.success("Billing refreshed from Stripe.", "billing-refresh"),
                    onError: (error) => notify.error(error, undefined, "billing-refresh"),
                  })
                }
              >
                {!refresh.isPending && <RefreshCw className="size-4" aria-hidden="true" />}
                Refresh
              </Button>
              {data.hasCustomer && (
                <Button
                  variant="secondary"
                  isLoading={portal.isPending}
                  onClick={() =>
                    portal.mutate(undefined, { onError: (error) => notify.error(error) })
                  }
                >
                  {!portal.isPending && <ExternalLink className="size-4" aria-hidden="true" />}
                  Manage billing
                </Button>
              )}
            </>
          )
        }
      />

      {warnings.length > 0 && (
        <Alert variant="warning" title="Before your plan changes">
          <ul className="list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}

      <AsyncContent
        isLoading={billing.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={billing.isError ? billing.error : undefined}
        errorTitle="We couldn't load billing"
        onRetry={() => void billing.refetch()}
        isRetrying={billing.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-6">
            {!data.configured && (
              <Alert variant="info" title="Billing isn't set up on this server">
                Plans and limits still apply, but subscriptions can't be bought here yet.
              </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <CreditCard className="size-4 text-primary" aria-hidden="true" />
                  Current plan
                </h2>
                <PlanStatus overview={data} />
                {data.subscription?.cancelAtPeriodEnd && (
                  <Button
                    className="mt-4"
                    isLoading={resume.isPending}
                    disabled={busy}
                    onClick={() =>
                      resume.mutate(undefined, {
                        onSuccess: () => {
                          setWarnings([]);
                          notify.success("Your subscription will continue.");
                        },
                        onError: (error) => notify.error(error),
                      })
                    }
                  >
                    Keep my subscription
                  </Button>
                )}
              </section>

              <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
                <h2 className="font-semibold">Usage</h2>
                <p className="mt-1 mb-4 text-xs text-muted">
                  Since {formatDate(data.usage.periodStart)}, across{" "}
                  {data.workspaces.map((workspace) => workspace.name).join(", ") ||
                    "your workspaces"}
                  .
                </p>
                {(() => {
                  const limits = data.plans.find((option) => option.plan === data.plan)?.limits;
                  if (!limits) return null;
                  return (
                    <div className="flex flex-col gap-4">
                      <UsageMeter
                        label="Workspaces"
                        used={data.usage.workspaces}
                        max={limits.workspaces}
                      />
                      <UsageMeter
                        label="AI generations"
                        used={data.usage.aiGenerations}
                        max={limits.aiGenerationsPerMonth}
                      />
                      <UsageMeter
                        label="Scheduled posts"
                        used={data.usage.scheduledPosts}
                        max={limits.scheduledPostsPerMonth}
                      />
                      <UsageMeter
                        label="Media storage"
                        used={data.usage.storageBytes}
                        max={limits.storageBytes}
                        format={formatFileSize}
                      />
                    </div>
                  );
                })()}
              </section>
            </div>

            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Plans</h2>
                <div
                  role="group"
                  aria-label="Billing period"
                  className="flex gap-1 rounded-lg border border-line p-1"
                >
                  {(["month", "year"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={interval === value}
                      onClick={() => setBillingInterval(value)}
                      className={cn(
                        "cursor-pointer rounded-md px-3 py-1 text-sm font-medium",
                        interval === value ? "bg-primary text-white" : "text-muted hover:text-ink",
                      )}
                    >
                      {value === "month" ? "Monthly" : "Yearly"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.plans.map((option) => (
                  <PlanCard
                    key={option.plan}
                    option={option}
                    overview={data}
                    interval={interval}
                    busy={busy}
                    onChoose={choose}
                  />
                ))}
              </div>
              <p className="text-xs text-muted">
                Prices shown are monthly list prices. Checkout shows the exact amount, including tax
                and yearly pricing.
              </p>
            </section>
          </div>
        )}
      </AsyncContent>

      {data && pending?.kind === "change" && pendingOption && (
        <ConfirmModal
          open
          title={
            isKeep
              ? `Keep ${pendingOption.label}?`
              : `${isUpgrade ? "Upgrade" : "Switch"} to ${pendingOption.label}?`
          }
          message={
            isKeep
              ? "This cancels the change or cancellation you booked."
              : isUpgrade
                ? "The change applies straight away. You'll be charged the prorated difference now, and the new plan only starts once that payment succeeds."
                : `You keep your current plan until ${formatDate(data.subscription?.currentPeriodEnd ?? null)}, then move to ${pendingOption.label}. Nothing is deleted if you're above its limits, but you won't be able to add more.`
          }
          confirmLabel={isKeep ? "Keep plan" : isUpgrade ? "Upgrade" : "Switch plan"}
          isLoading={change.isPending}
          error={change.error}
          onConfirm={() =>
            change.mutate(
              { plan: pending.plan, interval: pending.interval },
              {
                onSuccess: (result) => {
                  setWarnings(result.warnings);
                  setPending(null);
                  notify.success(
                    isKeep
                      ? "Your current plan will continue."
                      : isUpgrade
                        ? `Upgraded to ${pendingOption.label}.`
                        : `You'll move to ${pendingOption.label} at the end of the period.`,
                  );
                },
              },
            )
          }
          onClose={() => setPending(null)}
        />
      )}
      {data && pending?.kind === "cancel" && (
        <ConfirmModal
          open
          tone="danger"
          title="Cancel your subscription?"
          message={`You keep your plan until ${formatDate(data.subscription?.currentPeriodEnd ?? null)}, then move to Free. Autopilot and analytics stop, and anything above Free's limits is kept but can't grow. You can resume any time before then.`}
          confirmLabel="Cancel subscription"
          isLoading={cancel.isPending}
          error={cancel.error}
          onConfirm={() =>
            cancel.mutate(undefined, {
              onSuccess: (result) => {
                setWarnings(result.warnings);
                setPending(null);
                notify.success("Your subscription will end at the end of the period.");
              },
            })
          }
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}

export default Billing;
