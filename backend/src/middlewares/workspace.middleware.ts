import type { Request, RequestHandler } from "express";
import { WorkspaceStatus, type WorkspaceRoleValue } from "../constants/workspace.constant";
import { Workspace } from "../models/workspace.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import { getAuthenticatedUser } from "../utils/request.util";
import { hasMinimumRole } from "../utils/workspaceRoles.util";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

interface RequireWorkspaceOptions {
  /** Route parameter holding the workspace id. */
  param?: string;
  /**
   * Resolves the workspace id another way (a query parameter, or the workspace
   * that owns a resource). The result is still only a lookup key: access is
   * granted by membership exactly as for `param`.
   */
  getWorkspaceId?: (req: Request) => string | undefined | Promise<string | undefined>;
  /** Allow archived workspaces (only for restore). */
  allowArchived?: boolean;
}

const workspaceNotFound = () => AppError.notFound("Workspace not found");

/**
 * Authorizes access to the workspace named in the URL and attaches it to
 * `req.workspace` / `req.workspaceMember`. Must run after `authenticate`.
 *
 * The id from the client is only a lookup key: access is granted solely when a
 * membership for the authenticated user exists. Malformed ids, unknown
 * workspaces and workspaces the user doesn't belong to all return the same 404,
 * so the response never reveals whether another tenant's workspace exists.
 */
export const requireWorkspace =
  ({
    param = "workspaceId",
    allowArchived = false,
    getWorkspaceId,
  }: RequireWorkspaceOptions = {}): RequestHandler =>
  async (req, _res, next) => {
    const user = getAuthenticatedUser(req);
    const workspaceId = getWorkspaceId ? await getWorkspaceId(req) : req.params[param];

    if (typeof workspaceId !== "string" || !OBJECT_ID_PATTERN.test(workspaceId)) {
      throw workspaceNotFound();
    }

    const membership = await WorkspaceMember.findOne({ workspace: workspaceId, user: user._id });
    if (!membership) throw workspaceNotFound();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) throw workspaceNotFound();
    if (workspace.status === WorkspaceStatus.ARCHIVED && !allowArchived) {
      throw AppError.notFound("This workspace has been archived");
    }

    req.workspace = workspace;
    req.workspaceMember = membership;
    next();
  };

/** Requires the member's role to be `minimumRole` or higher. Use after `requireWorkspace()`. */
export const requireWorkspaceRole =
  (minimumRole: WorkspaceRoleValue): RequestHandler =>
  (req, _res, next) => {
    if (!req.workspaceMember) {
      throw AppError.internal("requireWorkspaceRole() must run after requireWorkspace()");
    }
    if (!hasMinimumRole(req.workspaceMember.role, minimumRole)) {
      throw AppError.forbidden(
        `This action requires the ${minimumRole.toLowerCase()} role or higher`,
      );
    }
    next();
  };
