import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { PlanBadge, UserStatusBadge } from "@/components/admin/AdminBadges";
import DataTable from "@/components/admin/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import { PLAN_LABELS, formatDate } from "@/lib/adminFormat";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { useAdminUsers } from "@/services/admin/useAdmin";
import type { Plan } from "@/types/billing";

const KEYS = ["q", "status", "role", "plan"] as const;

function AdminUsers() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const users = useAdminUsers({ ...values, limit: 25 });

  return (
    <AdminShell
      title="Users"
      description="Everyone with an account. Open a user to see details, usage and actions."
    >
      <FilterBar>
        <SearchFilter
          key={values.q}
          label="Search users"
          placeholder="Name or email"
          value={values.q}
          onChange={(value) => setFilter("q", value)}
        />
        <SelectFilter
          label="Status"
          value={values.status}
          onChange={(value) => setFilter("status", value)}
          options={[
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
          ]}
        />
        <SelectFilter
          label="Plan"
          value={values.plan}
          onChange={(value) => setFilter("plan", value)}
          options={(Object.keys(PLAN_LABELS) as Plan[]).map((plan) => ({
            value: plan,
            label: PLAN_LABELS[plan],
          }))}
        />
        <SelectFilter
          label="Role"
          value={values.role}
          onChange={(value) => setFilter("role", value)}
          options={[
            { value: "user", label: "User" },
            { value: "super_admin", label: "Super admin" },
          ]}
        />
      </FilterBar>
      {users.isError && <Alert variant="error">{getErrorMessage(users.error)}</Alert>}
      <DataTable
        label="Users"
        rows={users.data?.items}
        isLoading={users.isFetching}
        rowKey={(row) => row.id}
        rowHref={(row) => `${paths.adminUsers}/${row.id}`}
        columns={[
          {
            key: "user",
            header: "User",
            render: (row) => (
              <div className="min-w-0">
                <Link to={`${paths.adminUsers}/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                <p className="text-xs text-muted">{row.email}</p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                <UserStatusBadge status={row.status} />
                {row.role === "super_admin" && <Badge tone="warning">Super admin</Badge>}
                {!row.emailVerified && <Badge>Unverified</Badge>}
              </div>
            ),
          },
          { key: "plan", header: "Plan", render: (row) => <PlanBadge plan={row.plan} /> },
          { key: "workspaces", header: "Workspaces", render: (row) => row.workspaces },
          { key: "joined", header: "Joined", render: (row) => formatDate(row.createdAt) },
          {
            key: "active",
            header: "Last active",
            render: (row) => formatDate(row.lastActiveAt ?? row.lastLoginAt),
          },
        ]}
      />
      {users.data && (
        <Pagination
          page={users.data.page}
          pages={users.data.pages}
          total={users.data.total}
          onPage={setPage}
        />
      )}
    </AdminShell>
  );
}

export default AdminUsers;
