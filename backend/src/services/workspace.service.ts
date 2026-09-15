import type { Types } from "mongoose";
import { logger } from "../config/logger";
import {
  InvitationStatus,
  WorkspaceRole,
  type WorkspaceRoleValue,
  WorkspaceStatus,
} from "../constants/workspace.constant";
import { User, type UserDocument } from "../models/user.model";
import {
  type PublicWorkspace,
  toPublicWorkspace,
  Workspace,
  type WorkspaceDocument,
} from "../models/workspace.model";
import { WorkspaceInvitation } from "../models/workspaceInvitation.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import * as AIService from "./ai.service";
import * as BrandProfileService from "./brandProfile.service";
import * as ContentStrategyService from "./contentStrategy.service";
import * as PostService from "./post.service";
import * as SocialAccountService from "./socialAccount.service";
import * as FileService from "./file.service";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "../validators/workspace.validator";

export interface WorkspaceSummary {
  workspace: PublicWorkspace;
  role: WorkspaceRoleValue;
}

export interface WorkspaceList {
  workspaces: WorkspaceSummary[];
  /** The workspace to open by default, or null when the user has none. */
  activeWorkspaceId: string | null;
}

export const listUserWorkspaces = async (user: UserDocument): Promise<WorkspaceList> => {
  const memberships = await WorkspaceMember.find({ user: user._id })
    // Intentionally cross-workspace: lists the authenticated user's own memberships only.
    .setOptions({ skipWorkspaceScope: true })
    .populate<{ workspace: WorkspaceDocument | null }>("workspace")
    .sort({ createdAt: 1 });

  const workspaces: WorkspaceSummary[] = [];
  for (const membership of memberships) {
    const { workspace } = membership;
    if (!workspace) continue;
    // Archived workspaces are hidden from everyone except owners, who can restore them.
    if (workspace.status === WorkspaceStatus.ARCHIVED && membership.role !== WorkspaceRole.OWNER) {
      continue;
    }
    workspaces.push({ workspace: toPublicWorkspace(workspace), role: membership.role });
  }

  const activeIds = workspaces
    .filter(({ workspace }) => workspace.status === WorkspaceStatus.ACTIVE)
    .map(({ workspace }) => workspace.id);
  const preferred = user.activeWorkspace?.toString();

  return {
    workspaces,
    activeWorkspaceId:
      preferred && activeIds.includes(preferred) ? preferred : (activeIds[0] ?? null),
  };
};

const setActiveWorkspace = (userId: Types.ObjectId, workspaceId: Types.ObjectId) =>
  User.updateOne({ _id: userId }, { $set: { activeWorkspace: workspaceId } });

export const createWorkspace = async (
  user: UserDocument,
  input: CreateWorkspaceInput,
): Promise<WorkspaceSummary> => {
  const workspace = await Workspace.create({ ...input, createdBy: user._id });

  try {
    await WorkspaceMember.create({
      workspace: workspace._id,
      user: user._id,
      role: WorkspaceRole.OWNER,
    });
  } catch (error) {
    // No multi-document transaction on standalone MongoDB — compensate instead.
    await Workspace.deleteOne({ _id: workspace._id });
    throw error;
  }

  await setActiveWorkspace(user._id, workspace._id);
  logger.info({ userId: user.id, workspaceId: workspace.id }, "Workspace created");

  return { workspace: toPublicWorkspace(workspace), role: WorkspaceRole.OWNER };
};

export const getWorkspace = ({ workspace, member }: WorkspaceContext): WorkspaceSummary => ({
  workspace: toPublicWorkspace(workspace),
  role: member.role,
});

export const updateWorkspace = async (
  { workspace, member }: WorkspaceContext,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceSummary> => {
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) workspace.set(key, value);
  }
  await workspace.save();
  return { workspace: toPublicWorkspace(workspace), role: member.role };
};

/** Soft delete: data and memberships are kept so an owner can restore the workspace. */
export const archiveWorkspace = async ({ workspace, user }: WorkspaceContext): Promise<void> => {
  const now = new Date();
  workspace.status = WorkspaceStatus.ARCHIVED;
  workspace.archivedAt = now;
  workspace.archivedBy = user._id;
  await workspace.save();

  await WorkspaceInvitation.updateMany(
    { workspace: workspace._id, status: InvitationStatus.PENDING },
    { $set: { status: InvitationStatus.REVOKED, revokedAt: now } },
  );
  await User.updateMany({ activeWorkspace: workspace._id }, { $set: { activeWorkspace: null } });
  logger.info({ userId: user.id, workspaceId: workspace.id }, "Workspace archived");
};

export const restoreWorkspace = async ({
  workspace,
  member,
  user,
}: WorkspaceContext): Promise<WorkspaceSummary> => {
  workspace.status = WorkspaceStatus.ACTIVE;
  workspace.archivedAt = null;
  workspace.archivedBy = null;
  await workspace.save();

  logger.info({ userId: user.id, workspaceId: workspace.id }, "Workspace restored");
  return { workspace: toPublicWorkspace(workspace), role: member.role };
};

/**
 * Irreversibly deletes an archived workspace and everything it owns.
 *
 * The workspace document is removed first: if a later step fails, leftover rows
 * point at a workspace that no longer exists, so requireWorkspace() 404s and they
 * are unreachable. Add every new workspace-owned collection to the cleanup below.
 */
export const deleteWorkspacePermanently = async (
  { workspace, user }: WorkspaceContext,
  confirmName: string,
): Promise<void> => {
  if (workspace.status !== WorkspaceStatus.ARCHIVED) {
    throw AppError.conflict("Archive the workspace before deleting it permanently");
  }
  if (confirmName !== workspace.name) {
    throw AppError.badRequest("The workspace name doesn't match", [
      { path: "confirmName", message: "Type the workspace name exactly to confirm" },
    ]);
  }

  const workspaceId = workspace._id;
  await Workspace.deleteOne({ _id: workspaceId });
  await Promise.all([
    WorkspaceMember.deleteMany({ workspace: workspaceId }),
    WorkspaceInvitation.deleteMany({ workspace: workspaceId }),
    FileService.deleteAllWorkspaceFiles(workspaceId),
    BrandProfileService.deleteWorkspaceBrandProfile(workspaceId),
    SocialAccountService.deleteWorkspaceSocialData(workspaceId),
    AIService.deleteWorkspaceAIUsage(workspaceId),
    ContentStrategyService.deleteWorkspaceStrategies(workspaceId),
    PostService.deleteWorkspacePosts(workspaceId),
    User.updateMany({ activeWorkspace: workspaceId }, { $set: { activeWorkspace: null } }),
  ]);

  logger.warn({ userId: user.id, workspaceId: workspace.id }, "Workspace permanently deleted");
};

/** Remembers the workspace the user last switched to. Authorization happens in requireWorkspace(). */
export const switchWorkspace = async (context: WorkspaceContext): Promise<WorkspaceSummary> => {
  await setActiveWorkspace(context.user._id, context.workspace._id);
  return getWorkspace(context);
};
