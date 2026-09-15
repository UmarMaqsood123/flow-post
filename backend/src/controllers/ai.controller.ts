import type { Request, Response } from "express";
import * as AIService from "../services/ai.service";
import { sendSuccess } from "../utils/apiResponse.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type { AIUsageQuery } from "../validators/ai.validator";

/** Controllers stay thin: validated input in, AIService out. Prompts live in integrations/ai/prompts. */
const generate =
  <Input>(operation: (context: WorkspaceContext, input: Input) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    const data = await operation(getWorkspaceContext(req), req.body as Input);
    sendSuccess(res, { message: "Generated", data });
  };

export const GenerateContentStrategy = generate(AIService.generateContentStrategy);
export const GenerateContentIdeas = generate(AIService.generateContentIdeas);
export const GeneratePost = generate(AIService.generatePost);
export const RewritePost = generate(AIService.rewritePost);
export const GenerateHashtags = generate(AIService.generateHashtags);
export const GenerateHook = generate(AIService.generateHook);
export const GenerateCTA = generate(AIService.generateCTA);
export const AdaptForPlatform = generate(AIService.adaptForPlatform);

export const GetAIUsage = async (req: Request, res: Response) => {
  const { days } = req.query as unknown as AIUsageQuery;
  const data = await AIService.getUsageSummary(getWorkspaceContext(req).workspace._id, days);
  sendSuccess(res, { message: "AI usage", data });
};
