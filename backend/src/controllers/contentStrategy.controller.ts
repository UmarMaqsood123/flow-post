import type { Request, Response } from "express";
import * as ContentStrategyService from "../services/contentStrategy.service";
import { sendCreated, sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  ContentStrategyParams,
  GenerateContentStrategyInput,
  RegenerateContentStrategyInput,
  UpdateContentStrategyInput,
} from "../validators/contentStrategy.validator";

export const ListContentStrategies = async (req: Request, res: Response) => {
  const strategies = await ContentStrategyService.listStrategies(getWorkspaceContext(req));
  sendSuccess(res, { message: "Content strategies", data: { strategies } });
};

export const GetActiveContentStrategy = async (req: Request, res: Response) => {
  const strategy = await ContentStrategyService.getActiveStrategy(getWorkspaceContext(req));
  sendSuccess(res, { message: "Active content strategy", data: { strategy } });
};

export const GetContentStrategy = async (req: Request, res: Response) => {
  const { strategyId } = req.params as ContentStrategyParams;
  const strategy = await ContentStrategyService.getStrategy(getWorkspaceContext(req), strategyId);
  sendSuccess(res, { message: "Content strategy", data: { strategy } });
};

export const GenerateContentStrategy = async (req: Request, res: Response) => {
  const result = await ContentStrategyService.generateStrategy(
    getWorkspaceContext(req),
    req.body as GenerateContentStrategyInput,
  );
  sendCreated(res, result, "Strategy generated");
};

export const RegenerateContentStrategy = async (req: Request, res: Response) => {
  const { strategyId } = req.params as ContentStrategyParams;
  const result = await ContentStrategyService.regenerateStrategy(
    getWorkspaceContext(req),
    strategyId,
    req.body as RegenerateContentStrategyInput,
  );
  sendCreated(res, result, "New strategy version generated");
};

export const UpdateContentStrategy = async (req: Request, res: Response) => {
  const { strategyId } = req.params as ContentStrategyParams;
  const strategy = await ContentStrategyService.updateStrategy(
    getWorkspaceContext(req),
    strategyId,
    req.body as UpdateContentStrategyInput,
  );
  sendSuccess(res, { message: "Strategy saved", data: { strategy } });
};

export const ActivateContentStrategy = async (req: Request, res: Response) => {
  const { strategyId } = req.params as ContentStrategyParams;
  const strategy = await ContentStrategyService.activateStrategy(
    getWorkspaceContext(req),
    strategyId,
  );
  sendSuccess(res, { message: "Strategy activated", data: { strategy } });
};
