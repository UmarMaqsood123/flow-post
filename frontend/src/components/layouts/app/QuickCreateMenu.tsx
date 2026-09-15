import {
  CalendarPlus,
  ChevronDown,
  type LucideIcon,
  PenLine,
  Plus,
  Upload,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router";
import Popover from "@/components/ui/Popover";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { WorkspaceRole } from "@/types/workspace";

interface QuickCreateItem {
  label: string;
  description: string;
  icon: LucideIcon;
  to: string;
  /** Needs a workspace and at least this role. */
  minRole?: WorkspaceRole;
}

const ITEMS: QuickCreateItem[] = [
  {
    label: "Create with AI",
    description: "Generate on-brand posts",
    icon: WandSparkles,
    to: paths.aiCreate,
  },
  { label: "New post", description: "Write a post from scratch", icon: PenLine, to: paths.content },
  {
    label: "Schedule post",
    description: "Pick a time on the calendar",
    icon: CalendarPlus,
    to: paths.calendar,
  },
  {
    label: "Upload media",
    description: "Images, videos or documents",
    icon: Upload,
    to: paths.workspaceFiles,
    minRole: "EDITOR",
  },
  {
    label: "Invite teammate",
    description: "Add someone to this workspace",
    icon: UserPlus,
    to: paths.workspaceMembers,
    minRole: "ADMIN",
  },
];

function QuickCreateMenu() {
  const { current } = useCurrentWorkspace();
  const items = ITEMS.filter(
    (item) => !item.minRole || (current && hasMinimumRole(current.role, item.minRole)),
  );

  return (
    <Popover
      label="Quick create"
      buttonClassName={buttonStyles("primary", "gap-1.5 px-2.5 sm:px-3.5")}
      buttonContent={
        <>
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Create</span>
          <ChevronDown className="hidden size-3.5 opacity-80 sm:block" aria-hidden="true" />
        </>
      }
      panelClassName="w-72 max-w-[calc(100vw-2rem)] p-1.5"
    >
      {(close) => (
        <ul>
          {items.map(({ label, description, icon: Icon, to }) => (
            <li key={label}>
              <Link
                to={to}
                onClick={close}
                className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-slate-50"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted">{description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

export default QuickCreateMenu;
