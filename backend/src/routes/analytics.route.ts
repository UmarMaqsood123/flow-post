import { Router } from "express";
import * as AnalyticsController from "../controllers/analytics.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspaceRole } from "../middlewares/workspace.middleware";
import { analyticsQuerySchema } from "../validators/analytics.validator";

/**
 * /api/v1/workspaces/:workspaceId/analytics
 * Mounted inside the workspace-scoped router, which has already resolved
 * membership.
 */
const AnalyticsRouter = Router();

AnalyticsRouter.get(
  "/",
  validate({ query: analyticsQuerySchema }),
  AnalyticsController.GetAnalytics,
);

// Collecting calls the platforms, so it's limited to editors and above.
AnalyticsRouter.post(
  "/refresh",
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  AnalyticsController.RefreshAnalytics,
);

export { AnalyticsRouter };
