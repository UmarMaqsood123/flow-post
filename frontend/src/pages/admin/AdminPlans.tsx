import AdminShell from "@/components/admin/AdminShell";
import DataTable from "@/components/admin/DataTable";
import AsyncContent from "@/components/shared/AsyncContent";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import { PLAN_LABELS, formatUsd } from "@/lib/adminFormat";
import { formatFileSize } from "@/lib/files";
import { useAdminPlans } from "@/services/admin/useAdmin";

function AdminPlans() {
  const plans = useAdminPlans();
  const data = plans.data;

  return (
    <AdminShell
      title="Plans"
      description="Limits come from backend/src/constants/billing.constant.ts; prices come from Stripe. Changing either needs a deploy and can't be done from here."
    >
      <AsyncContent
        isLoading={plans.isPending}
        loading={<Skeleton className="h-80 rounded-xl" />}
        error={plans.isError ? plans.error : undefined}
        errorTitle="We couldn't load plans"
        onRetry={() => void plans.refetch()}
        isRetrying={plans.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-4">
            <Alert variant="info">
              Accounts without a paid subscription get the {PLAN_LABELS[data.defaultPlan]} plan
              (BILLING_DEFAULT_PLAN).
            </Alert>
            <DataTable
              label="Plans"
              rows={data.plans}
              rowKey={(row) => row.plan}
              columns={[
                {
                  key: "plan",
                  header: "Plan",
                  render: (row) => <span className="font-medium">{row.label}</span>,
                },
                {
                  key: "price",
                  header: "List price",
                  render: (row) => `${formatUsd(row.priceMonthlyUsd, 0)}/mo`,
                },
                {
                  key: "prices",
                  header: "Stripe prices",
                  render: (row) =>
                    row.stripePrices ? (
                      <span className="text-xs">
                        Monthly: {row.stripePrices.month ?? <em>not set</em>}
                        <br />
                        Yearly: {row.stripePrices.year ?? <em>not set</em>}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  key: "limits",
                  header: "Limits",
                  render: (row) => (
                    <span className="text-xs">
                      {row.limits.workspaces} workspaces · {row.limits.socialAccountsPerWorkspace}{" "}
                      accounts · {row.limits.teamMembersPerWorkspace} seats
                      <br />
                      {row.limits.aiGenerationsPerMonth.toLocaleString()} AI ·{" "}
                      {row.limits.scheduledPostsPerMonth.toLocaleString()} scheduled ·{" "}
                      {formatFileSize(row.limits.storageBytes)}
                    </span>
                  ),
                },
                {
                  key: "features",
                  header: "Features",
                  render: (row) =>
                    [
                      row.features.analytics && "Analytics",
                      row.features.autopilot && `Autopilot ${row.autopilot.postsPerWeek}/wk`,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—",
                },
                {
                  key: "subscribers",
                  header: "Subscribers",
                  render: (row) => (
                    <span className="text-xs">
                      {row.subscribers.entitled} active · {row.subscribers.gracePeriod} in grace
                      <br />
                      {row.subscribers.pastDue} past due · {row.subscribers.cancelling} cancelling
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </AsyncContent>
    </AdminShell>
  );
}

export default AdminPlans;
