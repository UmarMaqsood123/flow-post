import { Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import PageHeader from "@/components/shared/PageHeader";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/buttonStyles";
import ArchivedWorkspaceRow from "@/components/workspace/ArchivedWorkspaceRow";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useSwitchWorkspace from "@/services/workspace/useSwitchWorkspace";

type Tab = "active" | "archived";

/** Workspace management: every workspace the user belongs to, plus archived ones they own. */
function Workspaces() {
  const { current, activeWorkspaces, archivedWorkspaces, isPending, isError, error } =
    useCurrentWorkspace();
  const switchWorkspace = useSwitchWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "archived" ? "archived" : "active";

  /** Team and settings pages act on the current workspace, so switch first when needed. */
  const openWorkspace = async (workspaceId: string, path?: string) => {
    if (workspaceId !== current?.workspace.id) {
      try {
        await switchWorkspace.mutateAsync(workspaceId);
      } catch {
        return; // Error is shown from switchWorkspace.error.
      }
    }
    if (path) navigate(path);
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "active", label: "Active", count: activeWorkspaces.length },
    { id: "archived", label: "Archived", count: archivedWorkspaces.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Workspaces"
        description="Every workspace you own or belong to. Each one keeps a brand's team, settings and content separate."
        actions={
          <Link to={paths.createWorkspace} className={buttonStyles("primary")}>
            <Plus className="size-4" aria-hidden="true" />
            New workspace
          </Link>
        }
      />

      <div role="tablist" aria-label="Workspace status" className="flex gap-1 border-b border-line">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setSearchParams(id === "archived" ? { tab: "archived" } : {})}
            className={cn(
              "-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs",
                tab === id ? "bg-primary/10" : "bg-slate-100",
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {switchWorkspace.isError && (
        <Alert variant="error">{getErrorMessage(switchWorkspace.error)}</Alert>
      )}

      {isPending && <PageLoader label="Loading workspaces…" />}
      {isError && <Alert variant="error">{getErrorMessage(error)}</Alert>}

      {!isPending && !isError && tab === "active" && (
        <section id="panel-active" role="tabpanel" aria-labelledby="tab-active">
          {activeWorkspaces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-10 text-center">
              <h2 className="text-lg font-semibold">No workspaces yet</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Create a workspace for each brand you manage, or ask a teammate to invite you to
                theirs.
              </p>
              <Link to={paths.createWorkspace} className={buttonStyles("primary", "mt-5")}>
                Create workspace
              </Link>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeWorkspaces.map((summary) => {
                const workspaceId = summary.workspace.id;
                return (
                  <WorkspaceCard
                    key={workspaceId}
                    summary={summary}
                    isCurrent={workspaceId === current?.workspace.id}
                    isSwitching={
                      switchWorkspace.isPending && switchWorkspace.variables === workspaceId
                    }
                    onSwitch={() => void openWorkspace(workspaceId)}
                    onOpenTeam={() => void openWorkspace(workspaceId, paths.workspaceMembers)}
                    onOpenSettings={() => void openWorkspace(workspaceId, paths.workspaceSettings)}
                  />
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!isPending && !isError && tab === "archived" && (
        <section id="panel-archived" role="tabpanel" aria-labelledby="tab-archived">
          <p className="mb-4 text-sm text-muted">
            Archived workspaces are hidden from members. Only owners see them here and can restore
            or permanently delete them.
          </p>
          {archivedWorkspaces.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
              You have no archived workspaces.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-5">
              {archivedWorkspaces.map(({ workspace }) => (
                <ArchivedWorkspaceRow key={workspace.id} workspace={workspace} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default Workspaces;
