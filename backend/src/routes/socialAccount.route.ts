import { Router } from "express";
import * as SocialAccountController from "../controllers/socialAccount.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { authenticate, noStore } from "../middlewares/auth.middleware";
import { socialRateLimiters as limit } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspace, requireWorkspaceRole } from "../middlewares/workspace.middleware";
import { findAccountWorkspaceId } from "../services/socialAccount.service";
import {
  connectSocialAccountQuerySchema,
  oauthCallbackQuerySchema,
  publishSocialPostSchema,
  socialAccountIdParamsSchema,
  socialPlatformParamsSchema,
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
  validate({ params: socialPlatformParamsSchema, query: connectSocialAccountQuerySchema }),
  requireQueryWorkspace,
  requireWorkspaceRole(WorkspaceRole.ADMIN),
  limit.connect,
  SocialAccountController.StartSocialConnection,
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

SocialAccountRouter.post(
  "/:accountId/posts",
  validate({ params: socialAccountIdParamsSchema, body: publishSocialPostSchema }),
  requireAccountWorkspace,
  requireWorkspaceRole(WorkspaceRole.EDITOR),
  limit.publish,
  SocialAccountController.PublishSocialPost,
);

export { SocialAccountRouter };
