import type { Request, Response } from "express";
import { HttpStatus } from "../constants/http.constant";
import * as WorkspaceService from "../services/workspace.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getAuthenticatedUser } from "../utils/request.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "../validators/workspace.validator";

export const ListWorkspaces = async (req: Request, res: Response) => {
  const data = await WorkspaceService.listUserWorkspaces(getAuthenticatedUser(req));
  sendSuccess(res, { data, message: "Workspaces" });
};

export const CreateWorkspace = async (req: Request, res: Response) => {
  const data = await WorkspaceService.createWorkspace(
    getAuthenticatedUser(req),
    req.body as CreateWorkspaceInput,
  );
  sendSuccess(res, { data, message: "Workspace created", statusCode: HttpStatus.CREATED });
};

export const GetWorkspace = (req: Request, res: Response) => {
  sendSuccess(res, {
    data: WorkspaceService.getWorkspace(getWorkspaceContext(req)),
    message: "Workspace",
  });
};

export const UpdateWorkspace = async (req: Request, res: Response) => {
  const data = await WorkspaceService.updateWorkspace(
    getWorkspaceContext(req),
    req.body as UpdateWorkspaceInput,
  );
  sendSuccess(res, { data, message: "Workspace updated" });
};

export const ArchiveWorkspace = async (req: Request, res: Response) => {
  await WorkspaceService.archiveWorkspace(getWorkspaceContext(req));
  sendSuccess(res, { data: null, message: "Workspace archived" });
};

export const RestoreWorkspace = async (req: Request, res: Response) => {
  const data = await WorkspaceService.restoreWorkspace(getWorkspaceContext(req));
  sendSuccess(res, { data, message: "Workspace restored" });
};

export const SwitchWorkspace = async (req: Request, res: Response) => {
  const data = await WorkspaceService.switchWorkspace(getWorkspaceContext(req));
  sendSuccess(res, { data, message: "Switched workspace" });
};

export const DeleteWorkspacePermanently = async (req: Request, res: Response) => {
  const { confirmName } = req.body as { confirmName: string };
  await WorkspaceService.deleteWorkspacePermanently(getWorkspaceContext(req), confirmName);
  sendSuccess(res, { data: null, message: "Workspace permanently deleted" });
};
