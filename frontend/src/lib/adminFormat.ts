import type { Plan } from "@/types/billing";

export const PLAN_LABELS: Record<Plan, string> = {
  FREE: "Free",
  CREATOR: "Creator",
  PRO: "Pro",
  AGENCY: "Agency",
};

export const formatMoney = (amounts: Record<string, number>) => {
  const entries = Object.entries(amounts);
  if (entries.length === 0) return "$0";
  return entries
    .map(([currency, amount]) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 0,
      }).format(amount),
    )
    .join(" + ");
};

export const formatUsd = (amount: number, digits = 2) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(amount);

export const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";

export const formatDateTimeShort = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";

const ACTION_LABELS: Record<string, string> = {
  USER_SUSPENDED: "Suspended",
  USER_REACTIVATED: "Reactivated",
  SUPER_ADMIN_GRANTED: "Super admin granted",
  SUPER_ADMIN_REVOKED: "Super admin removed",
  PLAN_OVERRIDE_GRANTED: "Plan granted",
  PLAN_OVERRIDE_REVOKED: "Granted plan removed",
  USER_VIEWED: "Details viewed",
  WORKSPACE_VIEWED: "Details viewed",
  USAGE_INSPECTED: "Usage inspected",
  SUBSCRIPTION_VIEWED: "Subscription viewed",
};

export const auditActionLabel = (action: string) => ACTION_LABELS[action] ?? action;
