import { Settings, Users } from "lucide-react";
import Button from "@/components/ui/Button";
import type { WorkspaceSummary } from "@/types/workspace";
import RoleBadge from "./RoleBadge";
import WorkspaceAvatar from "./WorkspaceAvatar";

interface WorkspaceCardProps {
  summary: WorkspaceSummary;
  isCurrent: boolean;
  isSwitching: boolean;
  onSwitch: () => void;
  onOpenTeam: () => void;
  onOpenSettings: () => void;
}

function WorkspaceCard({
  summary: { workspace, role },
  isCurrent,
  isSwitching,
  onSwitch,
  onOpenTeam,
  onOpenSettings,
}: WorkspaceCardProps) {
  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <WorkspaceAvatar name={workspace.name} logo={workspace.logo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{workspace.name}</h3>
            {isCurrent && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                Current
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">
            {[workspace.industry, workspace.timezone.replaceAll("_", " ")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <RoleBadge role={role} />
      </div>

      {workspace.description && (
        <p className="mt-3 line-clamp-2 text-sm text-muted">{workspace.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4 [&:not(:first-child)]:mt-5">
        {!isCurrent && (
          <Button className="px-3 py-1.5" onClick={onSwitch} isLoading={isSwitching}>
            Switch
          </Button>
        )}
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          onClick={onOpenTeam}
          disabled={isSwitching}
        >
          <Users className="size-4" aria-hidden="true" />
          Team
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          onClick={onOpenSettings}
          disabled={isSwitching}
        >
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </Button>
      </div>
    </li>
  );
}

export default WorkspaceCard;
