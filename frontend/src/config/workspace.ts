import type { InvitableRole, WorkspaceRole } from "@/types/workspace";

/** Mirrors WORKSPACE_INDUSTRIES in backend/src/constants/workspace.constant.ts. */
export const WORKSPACE_INDUSTRIES = [
  "Agency",
  "Consumer goods",
  "E-commerce",
  "Education",
  "Entertainment & media",
  "Finance",
  "Food & beverage",
  "Health & wellness",
  "Hospitality & travel",
  "Non-profit",
  "Professional services",
  "Real estate",
  "Retail",
  "Software & technology",
  "Other",
] as const;

export const WORKSPACE_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];
export const INVITABLE_ROLES: InvitableRole[] = ["ADMIN", "EDITOR", "VIEWER"];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  OWNER: "Full control, including archiving the workspace and managing other owners.",
  ADMIN: "Manage workspace settings, invitations and editors or viewers.",
  EDITOR: "Create and edit content in the workspace.",
  VIEWER: "View workspace content without making changes.",
};

export const getBrowserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** All IANA time zones the browser knows, always including UTC and `include`. */
export const getTimeZones = (include?: string): string[] => {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const extras = ["UTC", include].filter(
    (zone): zone is string => Boolean(zone) && !zones.includes(zone as string),
  );
  return [...extras, ...zones];
};
