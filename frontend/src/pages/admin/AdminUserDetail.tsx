import { ArrowLeft, Ban, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import {
  PlanBadge,
  SubscriptionStatusBadge,
  UserStatusBadge,
} from "@/components/admin/AdminBadges";
import AuditHistory from "@/components/admin/AuditHistory";
import { DetailCard, Facts } from "@/components/admin/DetailCard";
import SuspendUserModal from "@/components/admin/SuspendUserModal";
import UsageInspector from "@/components/admin/UsageInspector";
import AsyncContent from "@/components/shared/AsyncContent";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { formatDate, formatDateTimeShort, formatUsd } from "@/lib/adminFormat";
import { paths } from "@/routing/paths";
import { useAdminUser } from "@/services/admin/useAdmin";
import useSession from "@/services/auth/useSession";

function AdminUserDetail() {
  const { userId = "" } = useParams();
  const details = useAdminUser(userId);
  const session = useSession();
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const data = details.data;
  const user = data?.user;
  const canSuspend = user && user.role !== "super_admin" && user.id !== session.data?.id;

  return (
    <AdminShell
      title={user?.name ?? "User"}
      description={
        <Link
          to={paths.adminUsers}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All users
        </Link>
      }
      actions={
        canSuspend && (
          <Button
            variant={user.status === "suspended" ? "secondary" : "danger"}
            onClick={() => setIsSuspendOpen(true)}
          >
            {user.status === "suspended" ? (
              <RotateCcw className="size-4" aria-hidden="true" />
            ) : (
              <Ban className="size-4" aria-hidden="true" />
            )}
            {user.status === "suspended" ? "Reactivate" : "Suspend"}
          </Button>
        )
      }
    >
      <AsyncContent
        isLoading={details.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={details.isError ? details.error : undefined}
        errorTitle="We couldn't load this user"
        onRetry={() => void details.refetch()}
        isRetrying={details.isRefetching}
      >
        {data && user && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted">Opening this page was recorded in the audit log.</p>
            {user.status === "suspended" && (
              <Alert variant="error" title="Suspended">
                {formatDateTimeShort(user.suspendedAt)} by {user.suspendedBy ?? "an admin"}. Reason:{" "}
                {user.suspensionReason}
              </Alert>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailCard title="Account">
                <Facts
                  items={[
                    ["Email", user.email],
                    ["Status", <UserStatusBadge key="status" status={user.status} />],
                    [
                      "Role",
                      user.role === "super_admin" ? (
                        <Badge key="role" tone="warning">
                          Super admin
                        </Badge>
                      ) : (
                        "User"
                      ),
                    ],
                    ["Email verified", user.emailVerified ? "Yes" : "No"],
                    ["Joined", formatDate(user.createdAt)],
                    ["Last sign-in", formatDateTimeShort(user.lastLoginAt)],
                    ["Last active", formatDateTimeShort(user.lastActiveAt)],
                    ["Active sessions", user.activeSessions],
                  ]}
                />
              </DetailCard>
              <DetailCard title="Billing">
                <Facts
                  items={[
                    ["Plan in force", <PlanBadge key="plan" plan={data.billing.plan} />],
                    ["Why", data.billing.planReason.replaceAll("_", " ")],
                    [
                      "Subscription",
                      data.billing.subscription ? (
                        <SubscriptionStatusBadge
                          key="sub"
                          status={data.billing.subscription.status}
                        />
                      ) : (
                        "None"
                      ),
                    ],
                    [
                      "Charged",
                      data.billing.subscription
                        ? `${formatUsd(data.billing.subscription.monthlyAmount)} / month${data.billing.subscription.monthlyAmountEstimated ? " (list price)" : ""}`
                        : "—",
                    ],
                    ["Renews", formatDate(data.billing.subscription?.currentPeriodEnd)],
                    [
                      "Cancelling",
                      data.billing.subscription?.cancelAtPeriodEnd ? "Yes, at period end" : "No",
                    ],
                    ["Payment failed", formatDateTimeShort(data.billing.paymentFailedAt)],
                    ["Stripe customer", data.billing.stripeCustomerId ?? "—"],
                  ]}
                />
                {data.billing.lastPaymentError && (
                  <Alert variant="warning">{data.billing.lastPaymentError}</Alert>
                )}
              </DetailCard>
            </div>

            <DetailCard title={`Workspaces (${data.memberships.length})`}>
              {data.memberships.length === 0 ? (
                <p className="text-sm text-muted">Not a member of any workspace.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {data.memberships.map((membership) => (
                    <li
                      key={membership.workspaceId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <Link
                        to={`${paths.adminWorkspaces}/${membership.workspaceId}`}
                        className="font-medium hover:underline"
                      >
                        {membership.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        {membership.role.toLowerCase()}
                        {membership.isBillingOwner && <Badge tone="primary">Billing owner</Badge>}
                        {membership.status === "archived" && <Badge>Archived</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">
                AI in the last 30 days: {data.ai.requestsLast30Days.toLocaleString()} requests,{" "}
                {formatUsd(data.ai.estimatedCostUsdLast30Days, 4)} estimated.
              </p>
            </DetailCard>

            <UsageInspector target={{ userId: user.id }} />

            <DetailCard title="Admin activity on this user">
              <AuditHistory records={data.auditHistory} />
            </DetailCard>
          </div>
        )}
      </AsyncContent>
      {user && canSuspend && (
        <SuspendUserModal
          user={user}
          open={isSuspendOpen}
          onClose={() => setIsSuspendOpen(false)}
        />
      )}
    </AdminShell>
  );
}

export default AdminUserDetail;
