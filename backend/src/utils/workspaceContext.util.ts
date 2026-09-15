import type { Request } from "express";
import type { Types } from "mongoose";
import type { UserDocument } from "../models/user.model";
import type { WorkspaceDocument } from "../models/workspace.model";
import type { WorkspaceMemberDocument } from "../models/workspaceMember.model";
import { AppError } from "./appError.util";
import { getAuthenticatedUser } from "./request.util";

export interface WorkspaceContext {
  user: UserDocument;
  workspace: WorkspaceDocument;
  /** The authenticated user's membership (and role) in `workspace`. */
  member: WorkspaceMemberDocument;
}

/** Returns the workspace authorized by `requireWorkspace()`. Never read workspace ids from the request directly. */
export const getWorkspaceContext = (req: Request): WorkspaceContext => {
  if (!req.workspace || !req.workspaceMember) {
    throw AppError.internal("Route is missing the requireWorkspace() middleware");
  }
  return { user: getAuthenticatedUser(req), workspace: req.workspace, member: req.workspaceMember };
};

/**
 * Builds a query filter for a workspace-owned resource, locked to the authorized
 * workspace. Use for every read/update/delete of tenant data, e.g.
 *   Post.findOne(scopeToWorkspace(req, { _id: req.params.postId }))
 */
export const scopeToWorkspace = <T extends object>(
  req: Request,
  filter?: T,
): T & { workspace: Types.ObjectId } => ({
  ...(filter ?? ({} as T)),
  workspace: getWorkspaceContext(req).workspace._id,
});
