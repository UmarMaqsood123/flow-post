import {
  BarChart3,
  CalendarDays,
  FileText,
  FolderOpen,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { paths } from "@/routing/paths";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Shows a "Soon" badge — the page is a placeholder. */
  comingSoon?: boolean;
  /** Hidden until the user has a current workspace. */
  requiresWorkspace?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", to: paths.dashboard, icon: LayoutDashboard }],
  },
  {
    title: "Content",
    items: [
      { label: "Calendar", to: paths.calendar, icon: CalendarDays, comingSoon: true },
      { label: "Posts", to: paths.posts, icon: FileText, comingSoon: true },
      { label: "Analytics", to: paths.analytics, icon: BarChart3, comingSoon: true },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Files", to: paths.workspaceFiles, icon: FolderOpen, requiresWorkspace: true },
      { label: "Team members", to: paths.workspaceMembers, icon: Users, requiresWorkspace: true },
      {
        label: "Workspace settings",
        to: paths.workspaceSettings,
        icon: Settings,
        requiresWorkspace: true,
      },
      { label: "All workspaces", to: paths.workspaces, icon: Layers },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Account settings", to: paths.accountSettings, icon: UserRound }],
  },
];
