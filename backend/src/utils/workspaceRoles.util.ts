import { WorkspaceRole, type WorkspaceRoleValue } from "../constants/workspace.constant";

const ROLE_RANK: Record<WorkspaceRoleValue, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

/** True when `role` is `minimum` or higher (OWNER > ADMIN > EDITOR > VIEWER). */
export const hasMinimumRole = (role: WorkspaceRoleValue, minimum: WorkspaceRoleValue): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[minimum];

/** Owners can manage anyone; everyone else only members ranked strictly below them. */
export const canManageMember = (actor: WorkspaceRoleValue, target: WorkspaceRoleValue): boolean =>
  actor === WorkspaceRole.OWNER || ROLE_RANK[actor] > ROLE_RANK[target];

/** Owners can grant any role (including OWNER); everyone else only roles strictly below their own. */
export const canAssignRole = (actor: WorkspaceRoleValue, role: WorkspaceRoleValue): boolean =>
  actor === WorkspaceRole.OWNER || ROLE_RANK[actor] > ROLE_RANK[role];
