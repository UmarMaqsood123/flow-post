import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { PlanBadge, SubscriptionStatusBadge } from "@/components/admin/AdminBadges";
import DataTable from "@/components/admin/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import { PLAN_LABELS, formatDate, formatUsd } from "@/lib/adminFormat";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { useAdminSubscriptions } from "@/services/admin/useAdmin";

const KEYS = ["q", "status", "plan", "paymentIssue"] as const;
const STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
];

function AdminSubscriptions() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const subscriptions = useAdminSubscriptions({ ...values, limit: 25 });

  return (
    <AdminShell
      title="Subscriptions"
      description="Stripe subscriptions as last synced. Open one for full billing details."
    >
      <FilterBar>
        <SearchFilter
          key={values.q}
          label="Search subscriptions"
          placeholder="Customer name or email"
          value={values.q}
          onChange={(value) => setFilter("q", value)}
        />
        <SelectFilter
          label="Status"
          value={values.status}
          onChange={(value) => setFilter("status", value)}
          options={STATUSES.map((status) => ({ value: status, label: status.replace("_", " ") }))}
        />
        <SelectFilter
          label="Plan"
          value={values.plan}
          onChange={(value) => setFilter("plan", value)}
          options={(["CREATOR", "PRO", "AGENCY"] as const).map((plan) => ({
            value: plan,
            label: PLAN_LABELS[plan],
          }))}
        />
        <SelectFilter
          label="Payment"
          value={values.paymentIssue}
          onChange={(value) => setFilter("paymentIssue", value)}
          options={[
            { value: "true", label: "Has failed payment" },
            { value: "false", label: "No payment issues" },
          ]}
        />
      </FilterBar>
      {subscriptions.isError && (
        <Alert variant="error">{getErrorMessage(subscriptions.error)}</Alert>
      )}
      <DataTable
        label="Subscriptions"
        rows={subscriptions.data?.items}
        isLoading={subscriptions.isFetching}
        rowKey={(row) => row.accountId}
        rowHref={(row) => `${paths.adminSubscriptions}/${row.accountId}`}
        columns={[
          {
            key: "customer",
            header: "Customer",
            render: (row) => (
              <Link
                to={`${paths.adminSubscriptions}/${row.accountId}`}
                className="font-medium hover:underline"
              >
                {row.user?.name ?? "Deleted user"}
                <span className="block text-xs font-normal text-muted">{row.user?.email}</span>
              </Link>
            ),
          },
          {
            key: "plan",
            header: "Plan",
            render: (row) => (
              <div className="flex flex-col gap-1">
                <PlanBadge plan={row.effectivePlan} />
                {row.subscription?.plan && row.subscription.plan !== row.effectivePlan && (
                  <span className="text-xs text-muted">
                    Subscribed: {PLAN_LABELS[row.subscription.plan]}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) =>
              row.subscription ? (
                <div className="flex flex-wrap gap-1">
                  <SubscriptionStatusBadge status={row.subscription.status} />
                  {row.subscription.cancelAtPeriodEnd && <Badge>Cancelling</Badge>}
                  {row.paymentFailedAt && <Badge tone="danger">Payment failed</Badge>}
                </div>
              ) : (
                "—"
              ),
          },
          {
            key: "amount",
            header: "Monthly",
            render: (row) =>
              row.subscription
                ? `${formatUsd(row.subscription.monthlyAmount)}${row.subscription.interval === "year" ? " (yearly)" : ""}`
                : "—",
          },
          {
            key: "renews",
            header: "Period ends",
            render: (row) => formatDate(row.subscription?.currentPeriodEnd),
          },
        ]}
      />
      {subscriptions.data && (
        <Pagination
          page={subscriptions.data.page}
          pages={subscriptions.data.pages}
          total={subscriptions.data.total}
          onPage={setPage}
        />
      )}
    </AdminShell>
  );
}

export default AdminSubscriptions;
