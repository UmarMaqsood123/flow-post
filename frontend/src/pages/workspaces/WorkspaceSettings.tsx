import { useNavigate } from "react-router";
import SettingsCard from "@/components/shared/SettingsCard";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import RoleBadge from "@/components/workspace/RoleBadge";
import WorkspaceAvatar from "@/components/workspace/WorkspaceAvatar";
import WorkspaceForm from "@/components/workspace/WorkspaceForm";
import { getErrorMessage } from "@/lib/forms";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import type { Workspace } from "@/types/workspace";
import useArchiveWorkspace from "@/services/workspace/useArchiveWorkspace";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useUpdateWorkspace from "@/services/workspace/useUpdateWorkspace";

const toFormValues = (workspace: Workspace) => ({
  name: workspace.name,
  logo: workspace.logo ?? "",
  website: workspace.website ?? "",
  industry: workspace.industry ?? "",
  description: workspace.description ?? "",
  timezone: workspace.timezone,
});

function WorkspaceSettings() {
  const { current } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const archiveWorkspace = useArchiveWorkspace();
  const navigate = useNavigate();

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;
  const { workspace, role } = current;
  const canEdit = hasMinimumRole(role, "ADMIN");

  const handleArchive = () => {
    const confirmed = window.confirm(
      `Archive "${workspace.name}"? Members lose access and pending invitations are revoked until an owner restores it.`,
    );
    if (confirmed) {
      archiveWorkspace.mutate(workspace.id, { onSuccess: () => navigate(paths.dashboard) });
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-center gap-4">
        <WorkspaceAvatar name={workspace.name} logo={workspace.logo} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">Workspace settings</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{workspace.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            Your role <RoleBadge role={role} />
          </p>
        </div>
      </header>

      {!canEdit && (
        <Alert variant="info">Only admins and owners can change workspace settings.</Alert>
      )}

      <SettingsCard title="General" description="How this workspace appears to your team.">
        <WorkspaceForm
          key={workspace.id}
          workspaceId={workspace.id}
          defaultValues={toFormValues(workspace)}
          submitLabel="Save changes"
          readOnly={!canEdit}
          requireChanges
          successMessage="Workspace settings saved."
          onSubmit={(values) =>
            updateWorkspace.mutateAsync({ workspaceId: workspace.id, payload: values })
          }
        />
      </SettingsCard>

      {role === "OWNER" && (
        <SettingsCard
          tone="danger"
          title="Archive workspace"
          description="Archiving hides this workspace from every member and revokes pending invitations. Nothing is deleted — owners can restore it from the workspace switcher."
        >
          <Button variant="danger" onClick={handleArchive} isLoading={archiveWorkspace.isPending}>
            Archive workspace
          </Button>
          {archiveWorkspace.isError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {getErrorMessage(archiveWorkspace.error)}
            </p>
          )}
        </SettingsCard>
      )}
    </div>
  );
}

export default WorkspaceSettings;
