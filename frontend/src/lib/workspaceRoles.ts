import type { WorkspaceRole } from "@/types/workspace";

/**
 * Mirrors backend/src/utils/workspaceRoles.util.ts. Used only to decide what UI
 * to show — the API enforces every permission independently.
 */
const ROLE_RANK: Record<WorkspaceRole, number> = { OWNER: 4, ADMIN: 3, EDITOR: 2, VIEWER: 1 };

export const hasMinimumRole = (role: WorkspaceRole, minimum: WorkspaceRole) =>
  ROLE_RANK[role] >= ROLE_RANK[minimum];

export const canManageMember = (actor: WorkspaceRole, target: WorkspaceRole) =>
  actor === "OWNER" || ROLE_RANK[actor] > ROLE_RANK[target];

export const canAssignRole = (actor: WorkspaceRole, role: WorkspaceRole) =>
  actor === "OWNER" || ROLE_RANK[actor] > ROLE_RANK[role];
