import Badge from "@/components/ui/Badge";
import { PLAN_LABELS } from "@/lib/adminFormat";
import type { Plan, SubscriptionStatus } from "@/types/billing";

export function PlanBadge({ plan }: { plan: Plan }) {
  return <Badge tone={plan === "FREE" ? "neutral" : "primary"}>{PLAN_LABELS[plan]}</Badge>;
}

export function UserStatusBadge({ status }: { status: string }) {
  return status === "suspended" ? (
    <Badge tone="danger">Suspended</Badge>
  ) : (
    <Badge tone="success">Active</Badge>
  );
}

const SUBSCRIPTION_TONES: Record<SubscriptionStatus, "success" | "warning" | "danger" | "neutral"> =
  {
    active: "success",
    trialing: "success",
    past_due: "warning",
    unpaid: "danger",
    canceled: "neutral",
    incomplete: "warning",
    incomplete_expired: "neutral",
    paused: "warning",
  };

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <Badge tone={SUBSCRIPTION_TONES[status]}>{status.replace("_", " ")}</Badge>;
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
