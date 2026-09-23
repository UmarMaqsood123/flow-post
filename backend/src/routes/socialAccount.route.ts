import { Router } from "express";
import * as SocialAccountController from "../controllers/socialAccount.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { authenticate, noStore } from "../middlewares/auth.middleware";
import { socialRateLimiters as limit } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspace, requireWorkspaceRole } from "../middlewares/workspace.middleware";
import { findAccountWorkspaceId } from "../services/socialAccount.service";
import {
  chooseConnectionTargetSchema,
  connectionDraftParamsSchema,
  connectSocialAccountQuerySchema,
  oauthCallbackQuerySchema,
  publishSocialPostSchema,
  socialAccountIdParamsSchema,
  socialPlatformParamsSchema,
  startConnectionQuerySchema,
} from "../validators/socialAccount.validator";

/**
 * /api/v1/social-accounts
 * Listing accounts and platforms lives under /workspaces/:workspaceId/social-accounts.
 * Tokens never leave the server: responses use toPublicSocialAccount().
 */
const SocialAccountRouter = Router();

SocialAccountRouter.use(noStore);

// The platform redirects the browser here without our Authorization header. The
// single-use state plus the httpOnly cookie set by /connect identify the attempt.
SocialAccountRouter.get(
  "/:platform/callback",
  limit.oauthCallback,
  validate({ params: socialPlatformParamsSchema, query: oauthCallbackQuerySchema }),
  SocialAccountController.HandleOAuthCallback,
);

SocialAccountRouter.use(authenticate);

/** Authorizes the workspace named in ?workspaceId= by membership. */
const requireQueryWorkspace = requireWorkspace({
  getWorkspaceId: (req) => (req.query as { workspaceId?: string }).workspaceId,
});

/** Authorizes the workspace that owns :accountId; unknown accounts and other tenants get the same 404. */
const requireAccountWorkspace = requireWorkspace({
  getWorkspaceId: (req) => findAccountWorkspaceId(String(req.params.accountId)),
});

SocialAccountRouter.get(
  "/:platform/connect",
  validate({ params: socialPlatformParamsSchema, query: startConnectionQuerySchema }),
  requireQueryWorkspace,
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  limit.connect,
  SocialAccountController.StartSocialConnection,
);

// Finishing a connection that granted several accounts: list them, then pick one.
SocialAccountRouter.get(
  "/connections/:draftId",
  validate({ params: connectionDraftParamsSchema, query: connectSocialAccountQuerySchema }),
  requireQueryWorkspace,
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  SocialAccountController.ListConnectionChoices,
);

SocialAccountRouter.post(
  "/connections/:draftId",
  validate({
    params: connectionDraftParamsSchema,
    query: connectSocialAccountQuerySchema,
    body: chooseConnectionTargetSchema,
  }),
  requireQueryWorkspace,
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  limit.connect,
  SocialAccountController.ChooseConnectionTarget,
);

SocialAccountRouter.delete(
  "/:accountId",
  validate({ params: socialAccountIdParamsSchema }),
  requireAccountWorkspace,
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  SocialAccountController.DisconnectSocialAccount,
);

SocialAccountRouter.post(
  "/:accountId/test",
  validate({ params: socialAccountIdParamsSchema }),
  requireAccountWorkspace,
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  limit.test,
  SocialAccountController.TestSocialAccount,
);

// Immediate publish outside the post workflow (no approval, no Autopilot pause),
// so it's limited to admins and still bound by the plan's publishing quota.
SocialAccountRouter.post(
  "/:accountId/posts",
  validate({ params: socialAccountIdParamsSchema, body: publishSocialPostSchema }),
  requireAccountWorkspace,
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  limit.publish,
  SocialAccountController.PublishSocialPost,
);

export { SocialAccountRouter };
