import type { Request, Response } from "express";
import { HttpStatus } from "../constants/http.constant";
import * as InvitationService from "../services/workspaceInvitation.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getAuthenticatedUser } from "../utils/request.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  InvitationParams,
  InvitationTokenInput,
  InviteMemberInput,
} from "../validators/workspace.validator";

export const ListInvitations = async (req: Request, res: Response) => {
  const invitations = await InvitationService.listPendingInvitations(
    getWorkspaceContext(req).workspace._id,
  );
  sendSuccess(res, { data: { invitations }, message: "Pending invitations" });
};

export const CreateInvitation = async (req: Request, res: Response) => {
  const invitation = await InvitationService.createInvitation(
    getWorkspaceContext(req),
    req.body as InviteMemberInput,
  );
  sendSuccess(res, {
    data: { invitation },
    message: "Invitation sent",
    statusCode: HttpStatus.CREATED,
  });
};

export const RevokeInvitation = async (req: Request, res: Response) => {
  const { invitationId } = req.params as InvitationParams;
  await InvitationService.revokeInvitation(getWorkspaceContext(req), invitationId);
  sendSuccess(res, { data: null, message: "Invitation revoked" });
};

export const PreviewInvitation = async (req: Request, res: Response) => {
  const { token } = req.query as InvitationTokenInput;
  const invitation = await InvitationService.previewInvitation(token, getAuthenticatedUser(req));
  sendSuccess(res, { data: { invitation }, message: "Invitation" });
};

export const AcceptInvitation = async (req: Request, res: Response) => {
  const { token } = req.body as InvitationTokenInput;
  const data = await InvitationService.acceptInvitation(token, getAuthenticatedUser(req));
  sendSuccess(res, { data, message: "You've joined the workspace" });
};
