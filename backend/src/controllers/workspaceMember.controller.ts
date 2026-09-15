import type { Request, Response } from "express";
import * as WorkspaceMemberService from "../services/workspaceMember.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { ChangeMemberRoleInput, MemberParams } from "../validators/workspace.validator";

export const ListMembers = async (req: Request, res: Response) => {
  const members = await WorkspaceMemberService.listMembers(getWorkspaceContext(req).workspace._id);
  sendSuccess(res, { data: { members }, message: "Workspace members" });
};

export const ChangeMemberRole = async (req: Request, res: Response) => {
  const { memberId } = req.params as MemberParams;
  const { role } = req.body as ChangeMemberRoleInput;
  const member = await WorkspaceMemberService.changeMemberRole(
    getWorkspaceContext(req),
    memberId,
    role,
  );
  sendSuccess(res, { data: { member }, message: "Member role updated" });
};

export const RemoveMember = async (req: Request, res: Response) => {
  const { memberId } = req.params as MemberParams;
  await WorkspaceMemberService.removeMember(getWorkspaceContext(req), memberId);
  sendSuccess(res, { data: null, message: "Member removed" });
};
