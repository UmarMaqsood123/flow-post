import {
  Bot,
  CalendarDays,
  ChartColumn,
  CreditCard,
  FileText,
  Images,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Share2,
  Users,
  WandSparkles,
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
  /** Active for every path under this prefix (e.g. all settings tabs). */
  matchPrefix?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const dashboard: NavItem = { label: "Dashboard", to: paths.dashboard, icon: LayoutDashboard };
const aiCreate: NavItem = {
  label: "AI Create",
  to: paths.aiCreate,
  icon: WandSparkles,
  comingSoon: true,
};
const content: NavItem = { label: "Content", to: paths.content, icon: FileText, comingSoon: true };
const calendar: NavItem = {
  label: "Calendar",
  to: paths.calendar,
  icon: CalendarDays,
  comingSoon: true,
};

export const NAV_SECTIONS: NavSection[] = [
  { title: "Overview", items: [dashboard, aiCreate] },
  {
    title: "Publishing",
    items: [
      content,
      calendar,
      { label: "Social Accounts", to: paths.socialAccounts, icon: Share2, comingSoon: true },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Analytics", to: paths.analytics, icon: ChartColumn, comingSoon: true },
      { label: "Autopilot", to: paths.autopilot, icon: Bot, comingSoon: true },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Media", to: paths.workspaceFiles, icon: Images, requiresWorkspace: true },
      { label: "Team", to: paths.workspaceMembers, icon: Users, requiresWorkspace: true },
    ],
  },
];

/** Pinned to the bottom of the sidebar. */
export const NAV_FOOTER_ITEMS: NavItem[] = [
  { label: "Billing", to: paths.billing, icon: CreditCard, comingSoon: true },
  { label: "Settings", to: paths.settings, icon: Settings, matchPrefix: paths.settings },
];

/** Bottom tab bar on phones; the last slot opens the full navigation drawer. */
export const MOBILE_TAB_ITEMS: NavItem[] = [dashboard, aiCreate, content, calendar];

export const isNavItemActive = (item: NavItem, pathname: string) => {
  const prefix = item.matchPrefix ?? item.to;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
};
