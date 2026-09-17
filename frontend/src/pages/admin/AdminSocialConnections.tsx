import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import DataTable from "@/components/admin/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import { formatDateTimeShort } from "@/lib/adminFormat";
import { CREATE_PLATFORM_OPTIONS, platformLabel } from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { useAdminSocialConnections } from "@/services/admin/useAdmin";

const KEYS = ["q", "platform", "status"] as const;
const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  CONNECTED: "success",
  EXPIRED: "warning",
  REAUTH_REQUIRED: "danger",
  DISCONNECTED: "neutral",
};

function AdminSocialConnections() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const connections = useAdminSocialConnections({ ...values, limit: 25 });

  return (
    <AdminShell
      title="Social connections"
      description="Connected accounts across every workspace. Tokens are never shown."
    >
      <FilterBar>
        <SearchFilter
          key={values.q}
          label="Search accounts"
          placeholder="Account name or username"
          value={values.q}
          onChange={(value) => setFilter("q", value)}
        />
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
          label="Status"
          value={values.status}
          onChange={(value) => setFilter("status", value)}
          options={Object.keys(STATUS_TONES).map((status) => ({
            value: status,
            label: status.toLowerCase().replace("_", " "),
          }))}
        />
      </FilterBar>
      {connections.isError && <Alert variant="error">{getErrorMessage(connections.error)}</Alert>}
      <DataTable
        label="Social connections"
        rows={connections.data?.items}
        isLoading={connections.isFetching}
        rowKey={(row) => row.id}
        columns={[
          {
            key: "account",
            header: "Account",
            render: (row) => (
              <div>
                <span className="font-medium">{row.accountName}</span>
                <span className="block text-xs text-muted">
                  {platformLabel(row.platform)}
                  {row.username ? ` · @${row.username}` : ""}
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
            key: "status",
            header: "Status",
            render: (row) => (
              <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>
                {row.status.toLowerCase().replace("_", " ")}
              </Badge>
            ),
          },
          {
            key: "expires",
            header: "Token expires",
            render: (row) => formatDateTimeShort(row.tokenExpiresAt),
          },
          {
            key: "checked",
            header: "Last checked",
            render: (row) => formatDateTimeShort(row.lastCheckedAt),
          },
          {
            key: "error",
            header: "Last error",
            render: (row) => <span className="text-xs">{row.lastError?.message ?? "—"}</span>,
          },
        ]}
      />
      {connections.data && (
        <Pagination
          page={connections.data.page}
          pages={connections.data.pages}
          total={connections.data.total}
          onPage={setPage}
        />
      )}
    </AdminShell>
  );
}

export default AdminSocialConnections;
