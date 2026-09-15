export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;
export type WorkspaceRoleValue = (typeof WORKSPACE_ROLES)[number];

export const WorkspaceRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
} as const satisfies Record<WorkspaceRoleValue, WorkspaceRoleValue>;

/** Roles that can be granted through an invitation. Ownership is granted by promoting a member. */
export const INVITABLE_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;

export const WorkspaceStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;
export type WorkspaceStatusValue = (typeof WorkspaceStatus)[keyof typeof WorkspaceStatus];

export const InvitationStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
} as const;
export type InvitationStatusValue = (typeof InvitationStatus)[keyof typeof InvitationStatus];

/** Mirrored in frontend/src/config/workspace.ts. */
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
