import { useState } from "react";
import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { StatTile } from "@/components/admin/AdminBadges";
import DataTable from "@/components/admin/DataTable";
import { DetailCard } from "@/components/admin/DetailCard";
import { FilterBar, SelectFilter } from "@/components/admin/Filters";
import { useListParams } from "@/components/admin/useListParams";
import AsyncContent from "@/components/shared/AsyncContent";
import Skeleton from "@/components/ui/Skeleton";
import { formatDateTimeShort, formatUsd } from "@/lib/adminFormat";
import { formatCompactNumber } from "@/lib/format";
import { paths } from "@/routing/paths";
import { useAdminAIUsage } from "@/services/admin/useAdmin";

const KEYS = ["days", "status", "operation"] as const;
const OPERATIONS = [
  "CREATE_POSTS",
  "REFINE_POST",
  "CONTENT_STRATEGY",
  "CONTENT_IDEAS",
  "GENERATE_POST",
  "REWRITE_POST",
  "HASHTAGS",
  "HOOK",
  "CTA",
  "ADAPT_FOR_PLATFORM",
  "PERFORMANCE_INSIGHTS",
  "AUTOPILOT_TOPIC",
];
const DAY_MS = 86_400_000;
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

function AdminAIUsage() {
  const { values, setFilter } = useListParams(KEYS);
  const days = Number(values.days) || 30;
  // Read once and rounded to the hour, so the cache key is stable while the page is open.
  const [toMs] = useState(() => Math.ceil(Date.now() / 3_600_000) * 3_600_000);
  const to = new Date(toMs);
  const usage = useAdminAIUsage({
    from: new Date(to.getTime() - days * DAY_MS).toISOString(),
    to: to.toISOString(),
    status: values.status,
    operation: values.operation,
  });
  const data = usage.data;
  const maxCost = Math.max(0.0001, ...(data?.byDay.map((row) => row.estimatedCostUsd) ?? [0]));

  return (
    <AdminShell
      title="AI usage"
      description="Requests, tokens and estimated provider cost across every workspace."
    >
      <FilterBar>
        <SelectFilter
          label="Range"
          allLabel={null}
          value={String(days)}
          onChange={(value) => setFilter("days", value === "30" ? "" : value)}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "365", label: "365 days" },
          ]}
        />
        <SelectFilter
          label="Result"
          value={values.status}
          onChange={(value) => setFilter("status", value)}
          options={[
            { value: "SUCCESS", label: "Succeeded" },
            { value: "FAILURE", label: "Failed" },
          ]}
        />
        <SelectFilter
          label="Operation"
          value={values.operation}
          onChange={(value) => setFilter("operation", value)}
          options={OPERATIONS.map((operation) => ({ value: operation, label: label(operation) }))}
        />
      </FilterBar>

      <AsyncContent
        isLoading={usage.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={usage.isError ? usage.error : undefined}
        errorTitle="We couldn't load AI usage"
        onRetry={() => void usage.refetch()}
        isRetrying={usage.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Requests" value={data.totals.requests.toLocaleString()} />
              <StatTile label="Failed" value={data.totals.failures.toLocaleString()} />
              <StatTile
                label="Tokens in / out"
                value={`${formatCompactNumber(data.totals.inputTokens)} / ${formatCompactNumber(data.totals.outputTokens)}`}
              />
              <StatTile
                label="Estimated cost"
                value={formatUsd(data.totals.estimatedCostUsd)}
                hint="Unpriced models count as $0"
              />
            </div>

            <DetailCard title="Cost by day">
              {data.byDay.length === 0 ? (
                <p className="text-sm text-muted">No requests in this range.</p>
              ) : (
                <ol className="flex h-32 items-end gap-0.5" aria-label="Estimated cost by day">
                  {data.byDay.map((row) => (
                    <li
                      key={row.day}
                      title={`${row.day}: ${formatUsd(row.estimatedCostUsd, 4)}, ${row.requests} requests`}
                      className="min-w-0 flex-1 rounded-t bg-primary/70"
                      style={{ height: `${Math.max(2, (row.estimatedCostUsd / maxCost) * 100)}%` }}
                    />
                  ))}
                </ol>
              )}
            </DetailCard>

            <div className="grid gap-4 xl:grid-cols-2">
              <DetailCard title="By operation">
                <DataTable
                  label="By operation"
                  rows={data.byOperation}
                  rowKey={(row) => row.operation}
                  columns={[
                    { key: "op", header: "Operation", render: (row) => label(row.operation) },
                    {
                      key: "requests",
                      header: "Requests",
                      render: (row) => row.requests.toLocaleString(),
                    },
                    {
                      key: "failures",
                      header: "Failed",
                      render: (row) => row.failures.toLocaleString(),
                    },
                    {
                      key: "cost",
                      header: "Cost",
                      render: (row) => formatUsd(row.estimatedCostUsd, 4),
                    },
                  ]}
                />
              </DetailCard>
              <DetailCard title="By model">
                <DataTable
                  label="By model"
                  rows={data.byModel}
                  rowKey={(row) => row.model}
                  columns={[
                    { key: "model", header: "Model", render: (row) => row.model },
                    {
                      key: "requests",
                      header: "Requests",
                      render: (row) => row.requests.toLocaleString(),
                    },
                    {
                      key: "tokens",
                      header: "Tokens",
                      render: (row) => formatCompactNumber(row.inputTokens + row.outputTokens),
                    },
                    {
                      key: "cost",
                      header: "Cost",
                      render: (row) => formatUsd(row.estimatedCostUsd, 4),
                    },
                  ]}
                />
              </DetailCard>
              <DetailCard title="Top workspaces">
                <DataTable
                  label="Top workspaces"
                  rows={data.topWorkspaces}
                  rowKey={(row) => row.workspaceId}
                  rowHref={(row) => `${paths.adminWorkspaces}/${row.workspaceId}`}
                  columns={[
                    {
                      key: "name",
                      header: "Workspace",
                      render: (row) => (
                        <Link
                          to={`${paths.adminWorkspaces}/${row.workspaceId}`}
                          className="hover:underline"
                        >
                          {row.name}
                        </Link>
                      ),
                    },
                    {
                      key: "requests",
                      header: "Requests",
                      render: (row) => row.requests.toLocaleString(),
                    },
                    {
                      key: "cost",
                      header: "Cost",
                      render: (row) => formatUsd(row.estimatedCostUsd, 4),
                    },
                  ]}
                />
              </DetailCard>
              <DetailCard title="Top users">
                <DataTable
                  label="Top users"
                  rows={data.topUsers}
                  rowKey={(row) => row.userId}
                  rowHref={(row) => `${paths.adminUsers}/${row.userId}`}
                  columns={[
                    {
                      key: "user",
                      header: "User",
                      render: (row) => (
                        <Link to={`${paths.adminUsers}/${row.userId}`} className="hover:underline">
                          {row.email ?? row.name}
                        </Link>
                      ),
                    },
                    {
                      key: "requests",
                      header: "Requests",
                      render: (row) => row.requests.toLocaleString(),
                    },
                    {
                      key: "cost",
                      header: "Cost",
                      render: (row) => formatUsd(row.estimatedCostUsd, 4),
                    },
                  ]}
                />
              </DetailCard>
            </div>

            <DetailCard title="Recent failures">
              <DataTable
                label="Recent AI failures"
                rows={data.recentFailures}
                rowKey={(row) => `${row.createdAt}-${row.workspaceId}-${row.operation}`}
                empty="No failures in this range."
                columns={[
                  {
                    key: "when",
                    header: "When",
                    render: (row) => formatDateTimeShort(row.createdAt),
                  },
                  { key: "op", header: "Operation", render: (row) => label(row.operation) },
                  { key: "error", header: "Error", render: (row) => row.errorCode ?? "—" },
                  {
                    key: "model",
                    header: "Model",
                    render: (row) => `${row.provider} · ${row.model}`,
                  },
                  { key: "where", header: "Workspace", render: (row) => row.workspaceName },
                ]}
              />
            </DetailCard>
          </div>
        )}
      </AsyncContent>
    </AdminShell>
  );
}

export default AdminAIUsage;
