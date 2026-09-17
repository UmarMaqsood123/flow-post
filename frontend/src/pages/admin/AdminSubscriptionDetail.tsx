import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { PlanBadge, SubscriptionStatusBadge } from "@/components/admin/AdminBadges";
import { DetailCard, Facts } from "@/components/admin/DetailCard";
import AsyncContent from "@/components/shared/AsyncContent";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import { PLAN_LABELS, formatDate, formatDateTimeShort, formatUsd } from "@/lib/adminFormat";
import { paths } from "@/routing/paths";
import { useAdminSubscription } from "@/services/admin/useAdmin";

function AdminSubscriptionDetail() {
  const { accountId = "" } = useParams();
  const details = useAdminSubscription(accountId);
  const data = details.data;
  const subscription = data?.subscription;

  return (
    <AdminShell
      title={data?.user ? `${data.user.name}'s subscription` : "Subscription"}
      description={
        <Link
          to={paths.adminSubscriptions}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All subscriptions
        </Link>
      }
    >
      <AsyncContent
        isLoading={details.isPending}
        loading={<Skeleton className="h-80 rounded-xl" />}
        error={details.isError ? details.error : undefined}
        errorTitle="We couldn't load this subscription"
        onRetry={() => void details.refetch()}
        isRetrying={details.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted">Opening this page was recorded in the audit log.</p>
            {data.lastPaymentError && (
              <Alert variant="warning" title="Payment problem">
                {data.lastPaymentError}
              </Alert>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailCard title="Subscription">
                <Facts
                  items={[
                    ["Plan in force", <PlanBadge key="plan" plan={data.effectivePlan} />],
                    ["Why", data.planReason.replaceAll("_", " ")],
                    [
                      "Subscribed plan",
                      subscription?.plan ? PLAN_LABELS[subscription.plan] : "Unknown price",
                    ],
                    [
                      "Status",
                      subscription ? (
                        <SubscriptionStatusBadge key="status" status={subscription.status} />
                      ) : (
                        "—"
                      ),
                    ],
                    [
                      "Charged",
                      subscription?.unitAmount != null
                        ? `${(subscription.unitAmount / 100).toFixed(2)} ${subscription.currency?.toUpperCase()} per ${subscription.interval}`
                        : "Not stored (list price used)",
                    ],
                    [
                      "Monthly equivalent",
                      subscription ? formatUsd(subscription.monthlyAmount) : "—",
                    ],
                    [
                      "Current period",
                      subscription
                        ? `${formatDate(subscription.currentPeriodStart)} to ${formatDate(subscription.currentPeriodEnd)}`
                        : "—",
                    ],
                    ["Cancels at period end", subscription?.cancelAtPeriodEnd ? "Yes" : "No"],
                    [
                      "Booked change",
                      subscription?.scheduledChange
                        ? `${PLAN_LABELS[subscription.scheduledChange.plan]} on ${formatDate(subscription.scheduledChange.effectiveAt)}`
                        : "None",
                    ],
                  ]}
                />
              </DetailCard>
              <DetailCard title="Customer">
                <Facts
                  items={[
                    [
                      "User",
                      data.user ? (
                        <Link
                          key="user"
                          to={`${paths.adminUsers}/${data.user.id}`}
                          className="hover:underline"
                        >
                          {data.user.email}
                        </Link>
                      ) : (
                        "Deleted user"
                      ),
                    ],
                    ["Stripe customer", data.stripeCustomerId ?? "—"],
                    ["Stripe subscription", subscription?.stripeSubscriptionId ?? "—"],
                    ["Stripe price", subscription?.stripePriceId ?? "—"],
                    ["Payment failed", formatDateTimeShort(data.paymentFailedAt)],
                    ["Grace period until", formatDateTimeShort(data.graceUntil)],
                    ["Last synced", formatDateTimeShort(data.lastSyncedAt)],
                  ]}
                />
              </DetailCard>
            </div>
            <DetailCard title={`Covered workspaces (${data.workspaces.length})`}>
              <ul className="flex flex-col gap-1 text-sm">
                {data.workspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <Link
                      to={`${paths.adminWorkspaces}/${workspace.id}`}
                      className="hover:underline"
                    >
                      {workspace.name}
                    </Link>
                    {workspace.status === "archived" && (
                      <span className="text-xs text-muted"> · archived</span>
                    )}
                  </li>
                ))}
              </ul>
            </DetailCard>
          </div>
        )}
      </AsyncContent>
    </AdminShell>
  );
}

export default AdminSubscriptionDetail;
