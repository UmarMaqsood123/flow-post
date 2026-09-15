import type { Types } from "mongoose";
import { logger } from "../config/logger";
import { WorkspaceRole, type WorkspaceRoleValue } from "../constants/workspace.constant";
import { User, type UserDocument } from "../models/user.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { canAssignRole, canManageMember, hasMinimumRole } from "../utils/workspaceRoles.util";

export interface PublicWorkspaceMember {
  id: string;
  role: WorkspaceRoleValue;
  joinedAt: Date;
  user: { id: string; name: string; email: string };
}

interface MemberWithUser {
  _id: Types.ObjectId;
  role: WorkspaceRoleValue;
  createdAt: Date;
  user: UserDocument | null;
}

const toPublicMember = (member: MemberWithUser): PublicWorkspaceMember | null =>
  member.user
    ? {
        id: member._id.toString(),
        role: member.role,
        joinedAt: member.createdAt,
        user: { id: member.user.id, name: member.user.name, email: member.user.email },
      }
    : null;

const lastOwnerError = (leaving: boolean) =>
  AppError.conflict(
    leaving
      ? "You're the only owner. Make another member an owner before leaving."
      : "A workspace needs at least one owner. Make another member an owner first.",
  );

const countOwners = (workspaceId: Types.ObjectId) =>
  WorkspaceMember.countDocuments({ workspace: workspaceId, role: WorkspaceRole.OWNER });

/** Member ids are always resolved inside the authorized workspace, so ids from other workspaces 404. */
const findMemberInWorkspace = async (workspaceId: Types.ObjectId, memberId: string) => {
  const member = await WorkspaceMember.findOne({ _id: memberId, workspace: workspaceId });
  if (!member) throw AppError.notFound("Member not found");
  return member;
};

const loadPublicMember = async (workspaceId: Types.ObjectId, memberId: Types.ObjectId) => {
  const member = await WorkspaceMember.findOne({ _id: memberId, workspace: workspaceId }).populate<{
    user: UserDocument | null;
  }>("user", "name email");
  const result = member ? toPublicMember(member) : null;
  if (!result) throw AppError.notFound("Member not found");
  return result;
};

export const listMembers = async (
  workspaceId: Types.ObjectId,
): Promise<PublicWorkspaceMember[]> => {
  const members = await WorkspaceMember.find({ workspace: workspaceId })
    .populate<{ user: UserDocument | null }>("user", "name email")
    .sort({ createdAt: 1 });

  return members.map(toPublicMember).filter((member) => member !== null);
};

export const changeMemberRole = async (
  { workspace, member: actor, user }: WorkspaceContext,
  memberId: string,
  role: WorkspaceRoleValue,
): Promise<PublicWorkspaceMember> => {
  const target = await findMemberInWorkspace(workspace._id, memberId);
  const isSelf = target._id.equals(actor._id);

  if (target.role !== role) {
    if (isSelf && actor.role !== WorkspaceRole.OWNER) {
      throw AppError.forbidden("You can't change your own role");
    }
    if (!isSelf && !canManageMember(actor.role, target.role)) {
      throw AppError.forbidden(
        "You can't change the role of a member with an equal or higher role",
      );
    }
    if (!canAssignRole(actor.role, role)) {
      throw AppError.forbidden(`You can't assign the ${role.toLowerCase()} role`);
    }
    if (target.role === WorkspaceRole.OWNER && (await countOwners(workspace._id)) <= 1) {
      throw lastOwnerError(false);
    }

    const previousRole = target.role;
    target.role = role;
    await target.save();

    // Two owners demoting each other at the same moment could leave none — roll back if so.
    if ((await countOwners(workspace._id)) === 0) {
      target.role = previousRole;
      await target.save();
      throw lastOwnerError(false);
    }

    logger.info(
      { workspaceId: workspace.id, actorId: user.id, memberId, from: previousRole, to: role },
      "Workspace member role changed",
    );
  }

  return loadPublicMember(workspace._id, target._id);
};

/** Removes a member, or lets a member leave when they remove themselves. */
export const removeMember = async (
  { workspace, member: actor, user }: WorkspaceContext,
  memberId: string,
): Promise<void> => {
  const target = await findMemberInWorkspace(workspace._id, memberId);
  const isSelf = target._id.equals(actor._id);

  if (!isSelf) {
    if (!hasMinimumRole(actor.role, WorkspaceRole.ADMIN)) {
      throw AppError.forbidden("Only admins and owners can remove members");
    }
    if (!canManageMember(actor.role, target.role)) {
      throw AppError.forbidden("You can't remove a member with an equal or higher role");
    }
  }
  if (target.role === WorkspaceRole.OWNER && (await countOwners(workspace._id)) <= 1) {
    throw lastOwnerError(isSelf);
  }

  await WorkspaceMember.deleteOne({ _id: target._id, workspace: workspace._id });
  await User.updateOne(
    { _id: target.user, activeWorkspace: workspace._id },
    { $set: { activeWorkspace: null } },
  );

  logger.info(
    { workspaceId: workspace.id, actorId: user.id, memberId, left: isSelf },
    "Workspace member removed",
  );
};
