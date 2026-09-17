import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { PlanBadge, UserStatusBadge } from "@/components/admin/AdminBadges";
import AuditHistory from "@/components/admin/AuditHistory";
import DataTable from "@/components/admin/DataTable";
import { DetailCard, Facts } from "@/components/admin/DetailCard";
import UsageInspector from "@/components/admin/UsageInspector";
import AsyncContent from "@/components/shared/AsyncContent";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { formatDate, formatDateTimeShort } from "@/lib/adminFormat";
import { platformLabel } from "@/config/post";
import { paths } from "@/routing/paths";
import { useAdminWorkspace } from "@/services/admin/useAdmin";

function AdminWorkspaceDetail() {
  const { workspaceId = "" } = useParams();
  const details = useAdminWorkspace(workspaceId);
  const data = details.data;

  return (
    <AdminShell
      title={data?.workspace.name ?? "Workspace"}
      description={
        <Link
          to={paths.adminWorkspaces}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All workspaces
        </Link>
      }
    >
      <AsyncContent
        isLoading={details.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={details.isError ? details.error : undefined}
        errorTitle="We couldn't load this workspace"
        onRetry={() => void details.refetch()}
        isRetrying={details.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted">Opening this page was recorded in the audit log.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailCard title="Workspace">
                <Facts
                  items={[
                    [
                      "Status",
                      data.workspace.status === "archived" ? (
                        <Badge key="s">Archived</Badge>
                      ) : (
                        <Badge key="s" tone="success">
                          Active
                        </Badge>
                      ),
                    ],
                    ["Plan", <PlanBadge key="plan" plan={data.entitlements.plan} />],
                    [
                      "Billing owner",
                      data.billingOwner ? (
                        <Link
                          key="owner"
                          to={`${paths.adminUsers}/${data.billingOwner.id}`}
                          className="hover:underline"
                        >
                          {data.billingOwner.email}
                        </Link>
                      ) : (
                        "—"
                      ),
                    ],
                    ["Time zone", data.workspace.timezone],
                    ["Industry", data.workspace.industry ?? "—"],
                    ["Created", formatDate(data.workspace.createdAt)],
                    [
                      "Autopilot",
                      data.autopilot
                        ? `${data.autopilot.status.toLowerCase()}${data.autopilot.pauseReason ? `: ${data.autopilot.pauseReason}` : ""}`
                        : "Not set up",
                    ],
                  ]}
                />
              </DetailCard>
              <DetailCard title="Publishing">
                <Facts
                  items={[
                    ["Published", data.publishing.published.toLocaleString()],
                    ["Scheduled", data.publishing.scheduled.toLocaleString()],
                    ["Failed posts", data.publishing.failed.toLocaleString()],
                    [
                      "Failed publishes, 30 days",
                      data.publishing.failedPublishesLast30Days.toLocaleString(),
                    ],
                  ]}
                />
              </DetailCard>
            </div>

            <DetailCard title={`Members (${data.members.length})`}>
              <DataTable
                label="Members"
                rows={data.members}
                rowKey={(row) => row.userId ?? row.name}
                columns={[
                  {
                    key: "name",
                    header: "Member",
                    render: (row) =>
                      row.userId ? (
                        <Link to={`${paths.adminUsers}/${row.userId}`} className="hover:underline">
                          {row.name}
                          <span className="block text-xs text-muted">{row.email}</span>
                        </Link>
                      ) : (
                        row.name
                      ),
                  },
                  { key: "role", header: "Role", render: (row) => row.role.toLowerCase() },
                  {
                    key: "status",
                    header: "Account",
                    render: (row) => (row.status ? <UserStatusBadge status={row.status} /> : "—"),
                  },
                  { key: "joined", header: "Joined", render: (row) => formatDate(row.joinedAt) },
                ]}
              />
            </DetailCard>

            <DetailCard title={`Social accounts (${data.socialAccounts.length})`}>
              <DataTable
                label="Social accounts"
                rows={data.socialAccounts}
                rowKey={(row) => row.id}
                empty="No accounts connected."
                columns={[
                  {
                    key: "account",
                    header: "Account",
                    render: (row) => `${platformLabel(row.platform)} · ${row.accountName}`,
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => row.status.toLowerCase().replaceAll("_", " "),
                  },
                  {
                    key: "checked",
                    header: "Last checked",
                    render: (row) => formatDateTimeShort(row.lastCheckedAt),
                  },
                  {
                    key: "error",
                    header: "Last error",
                    render: (row) => row.lastError?.message ?? "—",
                  },
                ]}
              />
            </DetailCard>

            <DetailCard title="Recent publishing failures">
              <DataTable
                label="Recent publishing failures"
                rows={data.recentFailures}
                rowKey={(row) => row.scheduleId}
                empty="No failures."
                columns={[
                  {
                    key: "when",
                    header: "Failed",
                    render: (row) => formatDateTimeShort(row.failedAt),
                  },
                  {
                    key: "post",
                    header: "Post",
                    render: (row) => `${platformLabel(row.platform)} · ${row.topic ?? "Untitled"}`,
                  },
                  { key: "error", header: "Error", render: (row) => row.error?.message ?? "—" },
                ]}
              />
            </DetailCard>

            <UsageInspector target={{ workspaceId: data.workspace.id }} />

            <DetailCard title="Admin activity on this workspace">
              <AuditHistory records={data.auditHistory} />
            </DetailCard>
          </div>
        )}
      </AsyncContent>
    </AdminShell>
  );
}

export default AdminWorkspaceDetail;
