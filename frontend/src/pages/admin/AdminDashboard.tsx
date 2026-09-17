import AdminShell from "@/components/admin/AdminShell";
import { StatTile } from "@/components/admin/AdminBadges";
import { DetailCard, Facts } from "@/components/admin/DetailCard";
import AsyncContent from "@/components/shared/AsyncContent";
import Skeleton from "@/components/ui/Skeleton";
import { PLAN_LABELS, formatDateTimeShort, formatMoney, formatUsd } from "@/lib/adminFormat";
import { formatCompactNumber } from "@/lib/format";
import { useAdminDashboard } from "@/services/admin/useAdmin";
import type { Plan } from "@/types/billing";

function AdminDashboard() {
  const dashboard = useAdminDashboard();
  const data = dashboard.data;

  return (
    <AdminShell
      title="Admin dashboard"
      description="Platform-wide numbers. Activity figures cover the last 30 days."
    >
      <AsyncContent
        isLoading={dashboard.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={dashboard.isError ? dashboard.error : undefined}
        errorTitle="We couldn't load the dashboard"
        onRetry={() => void dashboard.refetch()}
        isRetrying={dashboard.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              <StatTile
                label="Total users"
                value={data.users.total.toLocaleString()}
                hint={`${data.users.new} new`}
              />
              <StatTile
                label="Active users"
                value={data.users.active.toLocaleString()}
                hint="Signed in or used the app"
              />
              <StatTile
                label="Paid users"
                value={data.users.paid.toLocaleString()}
                hint={`${data.users.suspended} suspended`}
              />
              <StatTile
                label="Workspaces"
                value={data.workspaces.active.toLocaleString()}
                hint={`${data.workspaces.archived} archived`}
              />
              <StatTile
                label="Subscriptions"
                value={data.subscriptions.live.toLocaleString()}
                hint={`${data.subscriptions.byStatus.past_due ?? 0} past due`}
              />
              <StatTile
                label="MRR"
                value={formatMoney(data.revenue.mrr)}
                hint={`${formatMoney(data.revenue.atRiskMrr)} at risk`}
              />
              <StatTile
                label="AI requests"
                value={formatCompactNumber(data.ai.requests)}
                hint={`${data.ai.failures.toLocaleString()} failed`}
              />
              <StatTile
                label="AI estimated cost"
                value={formatUsd(data.ai.estimatedCostUsd)}
                hint={
                  data.ai.requestsWithUnknownCost
                    ? `${data.ai.requestsWithUnknownCost} requests unpriced`
                    : undefined
                }
              />
              <StatTile
                label="Connected accounts"
                value={data.socialAccounts.connected.toLocaleString()}
              />
              <StatTile
                label="Published posts"
                value={data.posts.published.toLocaleString()}
                hint={`${data.posts.publishedRecent.toLocaleString()} in 30 days`}
              />
              <StatTile
                label="Failed posts"
                value={data.posts.failed.toLocaleString()}
                hint={`${data.posts.needsReview} need review`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <DetailCard title="Paying by plan">
                <Facts
                  items={(Object.keys(data.subscriptions.payingByPlan) as Plan[]).map((plan) => [
                    PLAN_LABELS[plan],
                    data.subscriptions.payingByPlan[plan].toLocaleString(),
                  ])}
                />
              </DetailCard>
              <DetailCard title="Subscription status">
                <Facts
                  items={Object.entries(data.subscriptions.byStatus)
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => [status.replace("_", " "), count.toLocaleString()])}
                />
              </DetailCard>
              <DetailCard title="Revenue notes">
                <Facts
                  items={[
                    ["Trialing", data.revenue.trialing.toLocaleString()],
                    ["Priced from plan list", data.revenue.estimatedFromListPrice.toLocaleString()],
                    [
                      "AI tokens in / out",
                      `${formatCompactNumber(data.ai.inputTokens)} / ${formatCompactNumber(data.ai.outputTokens)}`,
                    ],
                    ["Updated", formatDateTimeShort(data.generatedAt)],
                  ]}
                />
                <p className="text-xs text-muted">
                  MRR uses the amounts Stripe charges, with yearly plans spread over 12 months.
                  Trials aren't counted, and past-due subscriptions are shown as at risk.
                </p>
              </DetailCard>
            </div>
          </div>
        )}
      </AsyncContent>
    </AdminShell>
  );
}

export default AdminDashboard;
