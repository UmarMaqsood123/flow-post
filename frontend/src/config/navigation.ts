import {
  Bot,
  CalendarDays,
  ChartColumn,
  Compass,
  CreditCard,
  FileText,
  Images,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldCheck,
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
  /** Only shown to super admins. The page and API check the role themselves. */
  superAdminOnly?: boolean;
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
  requiresWorkspace: true,
};
const content: NavItem = { label: "Content", to: paths.content, icon: FileText };
const calendar: NavItem = {
  label: "Calendar",
  to: paths.calendar,
  icon: CalendarDays,
  requiresWorkspace: true,
};

const strategy: NavItem = {
  label: "Strategy",
  to: paths.contentStrategy,
  icon: Compass,
  requiresWorkspace: true,
};

export const NAV_SECTIONS: NavSection[] = [
  { title: "Overview", items: [dashboard, strategy, aiCreate] },
  {
    title: "Publishing",
    items: [
      content,
      calendar,
      { label: "Social Accounts", to: paths.socialAccounts, icon: Share2, requiresWorkspace: true },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Analytics", to: paths.analytics, icon: ChartColumn },
      { label: "Autopilot", to: paths.autopilot, icon: Bot, requiresWorkspace: true },
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
  {
    label: "Admin",
    to: paths.admin,
    icon: ShieldCheck,
    superAdminOnly: true,
    matchPrefix: paths.admin,
  },
  { label: "Billing", to: paths.billing, icon: CreditCard },
  { label: "Settings", to: paths.settings, icon: Settings, matchPrefix: paths.settings },
];

/** Bottom tab bar on phones; the last slot opens the full navigation drawer. */
export const MOBILE_TAB_ITEMS: NavItem[] = [dashboard, aiCreate, content, calendar];

export const isNavItemActive = (item: NavItem, pathname: string) => {
  const prefix = item.matchPrefix ?? item.to;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
};
