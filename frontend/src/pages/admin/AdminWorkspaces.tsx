import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { PlanBadge } from "@/components/admin/AdminBadges";
import DataTable from "@/components/admin/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/adminFormat";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { useAdminWorkspaces } from "@/services/admin/useAdmin";

const KEYS = ["q", "status"] as const;

function AdminWorkspaces() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const workspaces = useAdminWorkspaces({ ...values, limit: 25 });

  return (
    <AdminShell
      title="Workspaces"
      description="Every workspace, with its billing owner and the plan that covers it."
    >
      <FilterBar>
        <SearchFilter
          key={values.q}
          label="Search workspaces"
          placeholder="Workspace name"
          value={values.q}
          onChange={(value) => setFilter("q", value)}
        />
        <SelectFilter
          label="Status"
          value={values.status}
          onChange={(value) => setFilter("status", value)}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </FilterBar>
      {workspaces.isError && <Alert variant="error">{getErrorMessage(workspaces.error)}</Alert>}
      <DataTable
        label="Workspaces"
        rows={workspaces.data?.items}
        isLoading={workspaces.isFetching}
        rowKey={(row) => row.id}
        rowHref={(row) => `${paths.adminWorkspaces}/${row.id}`}
        columns={[
          {
            key: "name",
            header: "Workspace",
            render: (row) => (
              <Link
                to={`${paths.adminWorkspaces}/${row.id}`}
                className="font-medium hover:underline"
              >
                {row.name}
              </Link>
            ),
          },
          {
            key: "owner",
            header: "Billing owner",
            render: (row) => <span className="text-xs">{row.billingOwner?.email ?? "—"}</span>,
          },
          { key: "plan", header: "Plan", render: (row) => <PlanBadge plan={row.plan} /> },
          { key: "members", header: "Members", render: (row) => row.members },
          { key: "social", header: "Accounts", render: (row) => row.socialAccounts },
          {
            key: "status",
            header: "Status",
            render: (row) =>
              row.status === "archived" ? (
                <Badge>Archived</Badge>
              ) : (
                <Badge tone="success">Active</Badge>
              ),
          },
          { key: "created", header: "Created", render: (row) => formatDate(row.createdAt) },
        ]}
      />
      {workspaces.data && (
        <Pagination
          page={workspaces.data.page}
          pages={workspaces.data.pages}
          total={workspaces.data.total}
          onPage={setPage}
        />
      )}
    </AdminShell>
  );
}

export default AdminWorkspaces;
