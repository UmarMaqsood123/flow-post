import { Gauge } from "lucide-react";
import UsageMeter from "@/components/billing/UsageMeter";
import Button from "@/components/ui/Button";
import { PLAN_LABELS, formatDate, formatUsd } from "@/lib/adminFormat";
import { formatFileSize } from "@/lib/files";
import { useInspectUsage } from "@/services/admin/useAdmin";
import { DetailCard } from "./DetailCard";
import DataTable from "./DataTable";
import { notify } from "@/lib/toast";

/**
 * Current usage against the plan with a per-workspace breakdown. Loaded only on
 * request, because every inspection is written to the audit log.
 */
function UsageInspector({ target }: { target: { userId: string } | { workspaceId: string } }) {
  const inspect = useInspectUsage();
  const data = inspect.data;

  return (
    <DetailCard
      title="Usage"
      action={
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-sm"
          isLoading={inspect.isPending}
          onClick={() => inspect.mutate(target, { onError: (error) => notify.error(error) })}
        >
          {!inspect.isPending && <Gauge className="size-4" aria-hidden="true" />}
          {data ? "Refresh usage" : "Inspect usage"}
        </Button>
      }
    >
      {!data && (
        <p className="text-sm text-muted">Inspecting usage is recorded in the audit log.</p>
      )}
      {data && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {PLAN_LABELS[data.plan]} plan · period since {formatDate(data.usage.periodStart)}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <UsageMeter
              label="AI generations"
              used={data.usage.aiGenerations}
              max={data.limits.aiGenerationsPerMonth}
            />
            <UsageMeter
              label="Scheduled posts"
              used={data.usage.scheduledPosts}
              max={data.limits.scheduledPostsPerMonth}
            />
            <UsageMeter
              label="Storage"
              used={data.usage.storageBytes}
              max={data.limits.storageBytes}
              format={formatFileSize}
            />
            <UsageMeter
              label="Workspaces"
              used={data.usage.workspaces}
              max={data.limits.workspaces}
            />
          </div>
          <DataTable
            label="Usage by workspace"
            rows={data.workspaces}
            rowKey={(row) => row.workspaceId}
            columns={[
              { key: "name", header: "Workspace", render: (row) => row.name },
              {
                key: "ai",
                header: "AI generations",
                render: (row) => row.aiGenerations.toLocaleString(),
              },
              {
                key: "cost",
                header: "AI cost",
                render: (row) => formatUsd(row.aiEstimatedCostUsd, 4),
              },
              {
                key: "scheduled",
                header: "Scheduled",
                render: (row) => row.scheduledPosts.toLocaleString(),
              },
              {
                key: "storage",
                header: "Storage",
                render: (row) => formatFileSize(row.storageBytes),
              },
              { key: "social", header: "Accounts", render: (row) => row.socialAccounts },
              { key: "members", header: "Members", render: (row) => row.members },
            ]}
          />
        </div>
      )}
    </DetailCard>
  );
}

export default UsageInspector;
