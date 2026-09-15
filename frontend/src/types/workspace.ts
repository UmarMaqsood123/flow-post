/** Mirrors the workspace API responses in backend/src/services/workspace*.service.ts. */

export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type InvitableRole = Exclude<WorkspaceRole, "OWNER">;

export interface Workspace {
  id: string;
  name: string;
  logo: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  timezone: string;
  status: "active" | "archived";
  createdBy: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSummary {
  workspace: Workspace;
  /** The signed-in user's role in this workspace. */
  role: WorkspaceRole;
}

export interface WorkspaceList {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
}

/** Empty strings clear optional fields. */
export interface WorkspacePayload {
  name: string;
  logo: string;
  website: string;
  industry: string;
  description: string;
  timezone: string;
}

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: { id: string; name: string; email: string };
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string } | null;
}

export interface InvitationPreview {
  workspace: { id: string; name: string; logo: string | null };
  role: WorkspaceRole;
  email: string;
  invitedBy: string | null;
  expiresAt: string;
  emailMatches: boolean;
}
