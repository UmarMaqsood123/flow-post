import { Router } from "express";
import * as ContentStrategyController from "../controllers/contentStrategy.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { aiRateLimiters } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspaceRole } from "../middlewares/workspace.middleware";
import {
  contentStrategyParamsSchema as params,
  generateContentStrategySchema,
  regenerateContentStrategySchema,
  updateContentStrategySchema,
} from "../validators/contentStrategy.validator";

/**
 * /api/v1/workspaces/:workspaceId/content-strategies — mounted on the workspace-scoped
 * router. Any member can view; editors generate and edit drafts; admins activate
 * and edit the active strategy (checked in the service).
 */
const ContentStrategyRouter = Router({ mergeParams: true });

const editor = requireWorkspaceRole(WorkspaceRole.EDITOR);
const generation = [editor, aiRateLimiters.generateByUser, aiRateLimiters.generateByWorkspace];

ContentStrategyRouter.get("/", ContentStrategyController.ListContentStrategies);
ContentStrategyRouter.get("/active", ContentStrategyController.GetActiveContentStrategy);
ContentStrategyRouter.post(
  "/generate",
  ...generation,
  validate({ body: generateContentStrategySchema }),
  ContentStrategyController.GenerateContentStrategy,
);
ContentStrategyRouter.get(
  "/:strategyId",
  validate({ params }),
  ContentStrategyController.GetContentStrategy,
);
ContentStrategyRouter.patch(
  "/:strategyId",
  editor,
  validate({ params, body: updateContentStrategySchema }),
  ContentStrategyController.UpdateContentStrategy,
);
ContentStrategyRouter.post(
  "/:strategyId/regenerate",
  ...generation,
  validate({ params, body: regenerateContentStrategySchema }),
  ContentStrategyController.RegenerateContentStrategy,
);
ContentStrategyRouter.post(
  "/:strategyId/activate",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ params }),
  ContentStrategyController.ActivateContentStrategy,
);

export { ContentStrategyRouter };
