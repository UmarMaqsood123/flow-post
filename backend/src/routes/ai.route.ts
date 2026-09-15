import { Router } from "express";
import * as AIController from "../controllers/ai.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { aiRateLimiters as limit } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspaceRole } from "../middlewares/workspace.middleware";
import {
  adaptForPlatformInputSchema,
  aiUsageQuerySchema,
  contentIdeasInputSchema,
  contentStrategyInputSchema,
  generateCtaInputSchema,
  generateHashtagsInputSchema,
  generateHookInputSchema,
  generatePostInputSchema,
  rewritePostInputSchema,
} from "../validators/ai.validator";

/**
 * /api/v1/workspaces/:workspaceId/ai — mounted on the workspace-scoped router,
 * so requireWorkspace() has already authorized the workspace.
 */
const AIRouter = Router({ mergeParams: true });

const editors = [
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  limit.generateByUser,
  limit.generateByWorkspace,
];

AIRouter.post(
  "/content-strategy",
  ...editors,
  validate({ body: contentStrategyInputSchema }),
  AIController.GenerateContentStrategy,
);
AIRouter.post(
  "/content-ideas",
  ...editors,
  validate({ body: contentIdeasInputSchema }),
  AIController.GenerateContentIdeas,
);
AIRouter.post(
  "/posts/generate",
  ...editors,
  validate({ body: generatePostInputSchema }),
  AIController.GeneratePost,
);
AIRouter.post(
  "/posts/rewrite",
  ...editors,
  validate({ body: rewritePostInputSchema }),
  AIController.RewritePost,
);
AIRouter.post(
  "/posts/adapt",
  ...editors,
  validate({ body: adaptForPlatformInputSchema }),
  AIController.AdaptForPlatform,
);
AIRouter.post(
  "/hashtags",
  ...editors,
  validate({ body: generateHashtagsInputSchema }),
  AIController.GenerateHashtags,
);
AIRouter.post(
  "/hooks",
  ...editors,
  validate({ body: generateHookInputSchema }),
  AIController.GenerateHook,
);
AIRouter.post(
  "/ctas",
  ...editors,
  validate({ body: generateCtaInputSchema }),
  AIController.GenerateCTA,
);

AIRouter.get(
  "/usage",
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  validate({ query: aiUsageQuerySchema }),
  AIController.GetAIUsage,
);

export { AIRouter };
