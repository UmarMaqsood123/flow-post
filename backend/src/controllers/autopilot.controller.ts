import type { Request, Response } from "express";
import * as AutopilotService from "../services/autopilot.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  ApproveAutopilotPostInput,
  ListAutopilotEventsQuery,
  PauseAutopilotInput,
  RejectAutopilotPostInput,
  UpdateAutopilotSettingsInput,
} from "../validators/autopilot.validator";

type PostParams = { postId: string };
type SlotParams = { slotId: string };

export const GetAutopilot = async (req: Request, res: Response) => {
  const overview = await AutopilotService.getOverview(getWorkspaceContext(req));
  sendSuccess(res, { message: "Autopilot", data: overview });
};

export const UpdateAutopilotSettings = async (req: Request, res: Response) => {
  const settings = await AutopilotService.updateSettings(
    getWorkspaceContext(req),
    req.body as UpdateAutopilotSettingsInput,
  );
  sendSuccess(res, { message: "Autopilot settings saved", data: settings });
};

export const StartAutopilot = async (req: Request, res: Response) => {
  const settings = await AutopilotService.start(getWorkspaceContext(req));
  sendSuccess(res, { message: "Autopilot is running", data: settings });
};

export const PauseAutopilot = async (req: Request, res: Response) => {
  const { reason } = req.body as PauseAutopilotInput;
  const settings = await AutopilotService.pause(getWorkspaceContext(req), reason);
  sendSuccess(res, { message: "Autopilot paused", data: settings });
};

export const ApproveAutopilotPost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await AutopilotService.approvePost(
    getWorkspaceContext(req),
    postId,
    req.body as ApproveAutopilotPostInput,
  );
  sendSuccess(res, { message: "Approved and scheduled", data: post });
};

export const RejectAutopilotPost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await AutopilotService.rejectPost(
    getWorkspaceContext(req),
    postId,
    req.body as RejectAutopilotPostInput,
  );
  sendSuccess(res, { message: "Rejected. The post is in your drafts.", data: post });
};

export const RetryAutopilotSlot = async (req: Request, res: Response) => {
  const { slotId } = req.params as SlotParams;
  const slot = await AutopilotService.retrySlot(getWorkspaceContext(req), slotId);
  sendSuccess(res, { message: "Posting time put back in line", data: slot });
};

export const ListAutopilotEvents = async (req: Request, res: Response) => {
  const result = await AutopilotService.listEvents(
    getWorkspaceContext(req),
    req.query as unknown as ListAutopilotEventsQuery,
  );
  sendSuccess(res, { message: "Autopilot activity", data: result });
};
