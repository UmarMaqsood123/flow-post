import { Archive, Check, ChevronsUpDown, Layers, Plus, Settings, Users } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { ROLE_LABELS } from "@/config/workspace";
import useDismiss from "@/hooks/useDismiss";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useSwitchWorkspace from "@/services/workspace/useSwitchWorkspace";
import WorkspaceAvatar from "./WorkspaceAvatar";

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50";

interface WorkspaceSwitcherProps {
  /** Stretch to the container width (sidebar) instead of a compact header button. */
  fullWidth?: boolean;
}

function WorkspaceSwitcher({ fullWidth = false }: WorkspaceSwitcherProps) {
  const { current, activeWorkspaces, archivedWorkspaces, isPending } = useCurrentWorkspace();
  const switchWorkspace = useSwitchWorkspace();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  if (isPending) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "animate-pulse rounded-md bg-slate-100",
          fullWidth ? "h-12 w-full" : "h-9 w-36",
        )}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-controls="workspace-switcher-panel"
        aria-label={
          current
            ? `Current workspace: ${current.workspace.name}. Switch workspace`
            : "Choose a workspace"
        }
        className={cn(
          "flex items-center gap-2 rounded-md border border-line bg-surface text-left text-sm hover:bg-slate-50",
          fullWidth ? "w-full px-2.5 py-2" : "max-w-40 px-2 py-1.5 sm:max-w-60",
        )}
      >
        {current ? (
          <>
            <WorkspaceAvatar
              name={current.workspace.name}
              logo={current.workspace.logo}
              size={fullWidth ? "md" : "sm"}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{current.workspace.name}</span>
              {fullWidth && (
                <span className="block text-xs text-muted">{ROLE_LABELS[current.role]}</span>
              )}
            </span>
          </>
        ) : (
          <span className="flex-1 truncate text-muted">Select workspace</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="workspace-switcher-panel"
          className={cn(
            "absolute z-50 mt-2 rounded-lg border border-line bg-surface p-1.5 shadow-lg",
            fullWidth ? "inset-x-0" : "left-0 w-72 max-w-[calc(100vw-2rem)]",
          )}
        >
          <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted">Workspaces</p>
          <ul className="max-h-64 overflow-y-auto">
            {activeWorkspaces.map(({ workspace, role }) => {
              const isCurrent = workspace.id === current?.workspace.id;
              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    aria-current={isCurrent ? "true" : undefined}
                    disabled={switchWorkspace.isPending}
                    onClick={() => {
                      if (!isCurrent) switchWorkspace.mutate(workspace.id);
                      close();
                    }}
                    className={menuItemClass}
                  >
                    <WorkspaceAvatar name={workspace.name} logo={workspace.logo} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{workspace.name}</span>
                      <span className="block text-xs text-muted">{ROLE_LABELS[role]}</span>
                    </span>
                    {isCurrent && (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
            {activeWorkspaces.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted">
                You&apos;re not in any workspace yet.
              </li>
            )}
          </ul>

          {switchWorkspace.error && (
            <p role="alert" className="px-2 py-1.5 text-xs text-red-700">
              {getErrorMessage(switchWorkspace.error)}
            </p>
          )}

          <div className="mt-1 border-t border-line pt-1">
            {current && (
              <>
                <Link to={paths.workspaceMembers} onClick={close} className={menuItemClass}>
                  <Users className="size-4 text-muted" aria-hidden="true" />
                  Team members
                </Link>
                <Link to={paths.workspaceSettings} onClick={close} className={menuItemClass}>
                  <Settings className="size-4 text-muted" aria-hidden="true" />
                  Workspace settings
                </Link>
              </>
            )}
            <Link to={paths.workspaces} onClick={close} className={menuItemClass}>
              <Layers className="size-4 text-muted" aria-hidden="true" />
              Manage workspaces
            </Link>
            {archivedWorkspaces.length > 0 && (
              <Link
                to={`${paths.workspaces}?tab=archived`}
                onClick={close}
                className={menuItemClass}
              >
                <Archive className="size-4 text-muted" aria-hidden="true" />
                Archived ({archivedWorkspaces.length})
              </Link>
            )}
            <Link to={paths.createWorkspace} onClick={close} className={menuItemClass}>
              <Plus className="size-4 text-muted" aria-hidden="true" />
              Create workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceSwitcher;
