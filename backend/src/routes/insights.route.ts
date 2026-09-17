import { Router } from "express";
import { WorkspaceRole } from "../constants/workspace.constant";
import * as InsightsController from "../controllers/insights.controller";
import { aiRateLimiters } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspaceRole } from "../middlewares/workspace.middleware";
import {
  decideInsightSchema,
  insightParamsSchema,
  reportParamsSchema,
} from "../validators/insights.validator";

/**
 * /api/v1/workspaces/:workspaceId/insights — any member can read reports; editors
 * run one on demand; only admins approve, because an approved insight steers AI
 * writing for the whole workspace.
 */
const InsightsRouter = Router({ mergeParams: true });

InsightsRouter.get("/", InsightsController.GetInsightsOverview);
InsightsRouter.post(
  "/generate",
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  aiRateLimiters.generateByUser,
  aiRateLimiters.generateByWorkspace,
  InsightsController.GenerateInsightReport,
);
InsightsRouter.get(
  "/:reportId",
  validate({ params: reportParamsSchema }),
  InsightsController.GetInsightReport,
);
InsightsRouter.patch(
  "/:reportId/insights/:insightId",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ params: insightParamsSchema, body: decideInsightSchema }),
  InsightsController.DecideInsight,
);

export { InsightsRouter };
