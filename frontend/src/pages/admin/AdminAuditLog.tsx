import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import DataTable from "@/components/admin/DataTable";
import { FilterBar, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import { auditActionLabel, formatDateTimeShort } from "@/lib/adminFormat";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { useAdminAuditLogs } from "@/services/admin/useAdmin";
import type { AuditLogRow } from "@/types/admin";

const KEYS = ["action", "targetType", "targetId", "actorId"] as const;
const ACTIONS = [
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "SUPER_ADMIN_GRANTED",
  "SUPER_ADMIN_REVOKED",
  "PLAN_OVERRIDE_GRANTED",
  "PLAN_OVERRIDE_REVOKED",
  "USER_VIEWED",
  "WORKSPACE_VIEWED",
  "USAGE_INSPECTED",
  "SUBSCRIPTION_VIEWED",
];
const CHANGES = new Set([
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "SUPER_ADMIN_GRANTED",
  "SUPER_ADMIN_REVOKED",
  "PLAN_OVERRIDE_GRANTED",
  "PLAN_OVERRIDE_REVOKED",
]);

const targetHref = (row: AuditLogRow) =>
  row.targetType === "USER"
    ? `${paths.adminUsers}/${row.targetId}`
    : row.targetType === "WORKSPACE"
      ? `${paths.adminWorkspaces}/${row.targetId}`
      : `${paths.adminSubscriptions}/${row.targetId}`;

function AdminAuditLog() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const logs = useAdminAuditLogs({ ...values, limit: 50 });

  return (
    <AdminShell
      title="Audit log"
      description="Every sensitive admin action: changes to accounts and each time someone's details or usage were opened. Records can't be edited or deleted."
    >
      <FilterBar>
        <SelectFilter
          label="Action"
          value={values.action}
          onChange={(value) => setFilter("action", value)}
          options={ACTIONS.map((action) => ({
            value: action,
            label: `${auditActionLabel(action)} (${action.split("_")[0].toLowerCase()})`,
          }))}
        />
        <SelectFilter
          label="Target"
          value={values.targetType}
          onChange={(value) => setFilter("targetType", value)}
          options={[
            { value: "USER", label: "Users" },
            { value: "WORKSPACE", label: "Workspaces" },
            { value: "SUBSCRIPTION", label: "Subscriptions" },
          ]}
        />
        {(values.targetId || values.actorId) && (
          <button
            type="button"
            className="cursor-pointer text-sm text-primary hover:underline"
            onClick={() => {
              setFilter("targetId", "");
              setFilter("actorId", "");
            }}
          >
            Clear person filter
          </button>
        )}
      </FilterBar>
      {logs.isError && <Alert variant="error">{getErrorMessage(logs.error)}</Alert>}
      <DataTable
        label="Audit log"
        rows={logs.data?.items}
        isLoading={logs.isFetching}
        rowKey={(row) => row.id}
        empty="No audit records match."
        columns={[
          { key: "when", header: "When", render: (row) => formatDateTimeShort(row.createdAt) },
          {
            key: "action",
            header: "Action",
            render: (row) => (
              <Badge tone={CHANGES.has(row.action) ? "warning" : "neutral"}>
                {auditActionLabel(row.action)}
              </Badge>
            ),
          },
          {
            key: "actor",
            header: "By",
            render: (row) => (
              <span className="text-xs">
                {row.actorEmail ?? "Command line"}
                {row.ip && <span className="block text-muted">{row.ip}</span>}
              </span>
            ),
          },
          {
            key: "target",
            header: "Target",
            render: (row) => (
              <Link to={targetHref(row)} className="text-xs hover:underline">
                {row.targetLabel ?? row.targetId}
              </Link>
            ),
          },
          {
            key: "reason",
            header: "Reason",
            render: (row) => <span className="text-xs">{row.reason ?? "—"}</span>,
          },
        ]}
      />
      {logs.data && (
        <Pagination
          page={logs.data.page}
          pages={logs.data.pages}
          total={logs.data.total}
          onPage={setPage}
        />
      )}
    </AdminShell>
  );
}

export default AdminAuditLog;
