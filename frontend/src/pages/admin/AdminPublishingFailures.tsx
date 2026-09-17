import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import DataTable from "@/components/admin/DataTable";
import { FilterBar, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import { formatDateTimeShort } from "@/lib/adminFormat";
import { CREATE_PLATFORM_OPTIONS, platformLabel } from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { useAdminPublishingFailures } from "@/services/admin/useAdmin";

const KEYS = ["platform", "needsReview"] as const;

function AdminPublishingFailures() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const failures = useAdminPublishingFailures({ ...values, limit: 25 });

  return (
    <AdminShell
      title="Publishing failures"
      description="Publishes that failed on every attempt. “Needs review” means the platform may have the post already, so it must not simply be retried."
    >
      <FilterBar>
        <SelectFilter
          label="Platform"
          value={values.platform}
          onChange={(value) => setFilter("platform", value)}
          options={CREATE_PLATFORM_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <SelectFilter
          label="Review"
          value={values.needsReview}
          onChange={(value) => setFilter("needsReview", value)}
          options={[
            { value: "true", label: "Needs review" },
            { value: "false", label: "Safe to retry" },
          ]}
        />
      </FilterBar>
      {failures.isError && <Alert variant="error">{getErrorMessage(failures.error)}</Alert>}
      <DataTable
        label="Publishing failures"
        rows={failures.data?.items}
        isLoading={failures.isFetching}
        rowKey={(row) => row.scheduleId}
        empty="No publishing failures."
        columns={[
          { key: "when", header: "Failed", render: (row) => formatDateTimeShort(row.failedAt) },
          {
            key: "post",
            header: "Post",
            render: (row) => (
              <div>
                <span className="font-medium">{row.topic ?? "Untitled"}</span>
                <span className="block text-xs text-muted">
                  {platformLabel(row.platform)}
                  {row.fromAutopilot ? " · Autopilot" : ""}
                </span>
              </div>
            ),
          },
          {
            key: "workspace",
            header: "Workspace",
            render: (row) => (
              <Link to={`${paths.adminWorkspaces}/${row.workspaceId}`} className="hover:underline">
                {row.workspaceName}
              </Link>
            ),
          },
          {
            key: "error",
            header: "Error",
            render: (row) => (
              <div className="max-w-md text-xs">
                {row.needsReview && (
                  <Badge tone="danger" className="mb-1">
                    Needs review
                  </Badge>
                )}
                <p>{row.error?.message ?? "—"}</p>
                {row.error?.code && <p className="text-muted">{row.error.code}</p>}
              </div>
            ),
          },
          {
            key: "attempts",
            header: "Attempts",
            render: (row) => `${row.attempts} of ${row.maxAttempts}`,
          },
        ]}
      />
      {failures.data && (
        <Pagination
          page={failures.data.page}
          pages={failures.data.pages}
          total={failures.data.total}
          onPage={setPage}
        />
      )}
    </AdminShell>
  );
}

export default AdminPublishingFailures;
