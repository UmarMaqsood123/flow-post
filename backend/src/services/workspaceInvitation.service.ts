import type { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import {
  InvitationStatus,
  type InvitationStatusValue,
  type WorkspaceRoleValue,
  WorkspaceStatus,
} from "../constants/workspace.constant";
import { User, type UserDocument } from "../models/user.model";
import { toPublicWorkspace, Workspace } from "../models/workspace.model";
import { WorkspaceInvitation } from "../models/workspaceInvitation.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import { generateOpaqueToken, hashToken } from "../utils/token.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { canAssignRole } from "../utils/workspaceRoles.util";
import type { InviteMemberInput } from "../validators/workspace.validator";
import * as EmailService from "./email.service";
import type { WorkspaceSummary } from "./workspace.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PublicInvitation {
  id: string;
  email: string;
  role: WorkspaceRoleValue;
  status: InvitationStatusValue;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { id: string; name: string } | null;
}

export interface InvitationPreview {
  workspace: { id: string; name: string; logo: string | null };
  role: WorkspaceRoleValue;
  email: string;
  invitedBy: string | null;
  expiresAt: Date;
  /** Whether the signed-in user's email matches the invitation. */
  emailMatches: boolean;
}

interface InvitationWithInviter {
  _id: Types.ObjectId;
  email: string;
  role: WorkspaceRoleValue;
  status: InvitationStatusValue;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: UserDocument | null;
}

const toPublicInvitation = (invitation: InvitationWithInviter): PublicInvitation => ({
  id: invitation._id.toString(),
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
  invitedBy: invitation.invitedBy
    ? { id: invitation.invitedBy.id, name: invitation.invitedBy.name }
    : null,
});

const invalidInvitation = () =>
  new AppError(
    "This invitation is invalid, expired or has already been used",
    HttpStatus.BAD_REQUEST,
    {
      code: ErrorCode.INVALID_TOKEN,
    },
  );

export const listPendingInvitations = async (
  workspaceId: Types.ObjectId,
): Promise<PublicInvitation[]> => {
  const invitations = await WorkspaceInvitation.find({
    workspace: workspaceId,
    status: InvitationStatus.PENDING,
    expiresAt: { $gt: new Date() },
  })
    .populate<{ invitedBy: UserDocument | null }>("invitedBy", "name")
    .sort({ createdAt: -1 });

  return invitations.map(toPublicInvitation);
};

export const createInvitation = async (
  { workspace, member, user }: WorkspaceContext,
  { email, role }: InviteMemberInput,
): Promise<PublicInvitation> => {
  if (!canAssignRole(member.role, role)) {
    throw AppError.forbidden(`You can't invite members with the ${role.toLowerCase()} role`);
  }

  const existingUser = await User.findOne({ email }).select("_id");
  if (
    existingUser &&
    (await WorkspaceMember.exists({ workspace: workspace._id, user: existingUser._id }))
  ) {
    throw AppError.conflict("This person is already a member of the workspace");
  }

  // Re-inviting replaces the previous invitation so only the newest link works.
  const now = new Date();
  await WorkspaceInvitation.updateMany(
    { workspace: workspace._id, email, status: InvitationStatus.PENDING },
    { $set: { status: InvitationStatus.REVOKED, revokedAt: now } },
  );

  const token = generateOpaqueToken(32);
  const invitation = await WorkspaceInvitation.create({
    workspace: workspace._id,
    email,
    role,
    tokenHash: hashToken(token),
    invitedBy: user._id,
    expiresAt: new Date(now.getTime() + env.WORKSPACE_INVITATION_TTL_DAYS * DAY_MS),
  });

  EmailService.dispatchEmail(
    () =>
      EmailService.sendWorkspaceInvitationEmail({
        email,
        inviterName: user.name,
        workspaceName: workspace.name,
        role,
        token,
      }),
    "workspace-invitation",
  );
  logger.info(
    { workspaceId: workspace.id, invitationId: invitation.id, actorId: user.id, role },
    "Workspace invitation created",
  );

  return toPublicInvitation({ ...invitation.toObject(), invitedBy: user });
};

export const revokeInvitation = async (
  { workspace, user }: WorkspaceContext,
  invitationId: string,
): Promise<void> => {
  const result = await WorkspaceInvitation.updateOne(
    { _id: invitationId, workspace: workspace._id, status: InvitationStatus.PENDING },
    { $set: { status: InvitationStatus.REVOKED, revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) throw AppError.notFound("Invitation not found");

  logger.info({ workspaceId: workspace.id, invitationId, actorId: user.id }, "Invitation revoked");
};

/** The workspace is derived from the secret token — never from client input. */
const findUsableInvitation = async (token: string) => {
  const invitation = await WorkspaceInvitation.findOne({
    tokenHash: hashToken(token),
    status: InvitationStatus.PENDING,
    expiresAt: { $gt: new Date() },
  })
    // Intentionally unscoped: the invitation is located by its unguessable token.
    .setOptions({ skipWorkspaceScope: true })
    .populate<{ invitedBy: UserDocument | null }>("invitedBy", "name");
  if (!invitation) throw invalidInvitation();

  const workspace = await Workspace.findOne({
    _id: invitation.workspace,
    status: WorkspaceStatus.ACTIVE,
  });
  if (!workspace) throw invalidInvitation();

  return { invitation, workspace };
};

export const previewInvitation = async (
  token: string,
  user: UserDocument,
): Promise<InvitationPreview> => {
  const { invitation, workspace } = await findUsableInvitation(token);
  return {
    workspace: { id: workspace.id, name: workspace.name, logo: workspace.logo ?? null },
    role: invitation.role,
    email: invitation.email,
    invitedBy: invitation.invitedBy?.name ?? null,
    expiresAt: invitation.expiresAt,
    emailMatches: invitation.email === user.email,
  };
};

export const acceptInvitation = async (
  token: string,
  user: UserDocument,
): Promise<WorkspaceSummary> => {
  const { invitation, workspace } = await findUsableInvitation(token);

  if (invitation.email !== user.email) {
    throw AppError.forbidden(
      "This invitation was sent to a different email address. Log in with that account to accept it.",
    );
  }
  if (!user.emailVerified) {
    throw AppError.forbidden(
      "Verify your email address before joining a workspace",
      ErrorCode.EMAIL_NOT_VERIFIED,
    );
  }

  // Claim atomically so a token can only ever be used once.
  const claimed = await WorkspaceInvitation.findOneAndUpdate(
    { _id: invitation._id, workspace: workspace._id, status: InvitationStatus.PENDING },
    {
      $set: { status: InvitationStatus.ACCEPTED, acceptedBy: user._id, acceptedAt: new Date() },
    },
  );
  if (!claimed) throw invalidInvitation();

  const membership =
    (await WorkspaceMember.findOne({ workspace: workspace._id, user: user._id })) ??
    (await WorkspaceMember.create({
      workspace: workspace._id,
      user: user._id,
      role: invitation.role,
      invitedBy: invitation.invitedBy?._id ?? null,
    }));

  await User.updateOne({ _id: user._id }, { $set: { activeWorkspace: workspace._id } });
  logger.info(
    { workspaceId: workspace.id, userId: user.id, role: membership.role },
    "Workspace invitation accepted",
  );

  return { workspace: toPublicWorkspace(workspace), role: membership.role };
};
