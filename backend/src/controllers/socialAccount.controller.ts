import type { Request, Response } from "express";
import { env } from "../config/env";
import { ErrorCode, HttpStatus } from "../constants/http.constant";
import {
  FRONTEND_SOCIAL_ACCOUNTS_PATH,
  platformSlug,
  type SocialPlatformValue,
} from "../constants/social.constant";
import * as SocialAccountService from "../services/socialAccount.service";
import { sendSuccess } from "../utils/apiResponse.util";
import { AppError } from "../utils/appError.util";
import {
  clearSocialOAuthCookie,
  getSocialOAuthCookie,
  setSocialOAuthCookie,
} from "../utils/cookie.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  ChooseConnectionTargetInput,
  ConnectionDraftParams,
  OAuthCallbackQuery,
  PublishSocialPostInput,
  SocialAccountIdParams,
  SocialPlatformParams,
  StartConnectionQuery,
} from "../validators/socialAccount.validator";

export const ListSocialPlatforms = (_req: Request, res: Response) => {
  sendSuccess(res, {
    message: "Social platforms",
    data: { platforms: SocialAccountService.listPlatforms() },
  });
};

export const ListSocialAccounts = async (req: Request, res: Response) => {
  const accounts = await SocialAccountService.listAccounts(getWorkspaceContext(req).workspace._id);
  sendSuccess(res, { message: "Social accounts", data: { accounts } });
};

/** Returns the consent URL (the SPA navigates to it) and binds the attempt to this browser. */
export const StartSocialConnection = async (req: Request, res: Response) => {
  const { platform } = req.params as unknown as SocialPlatformParams;
  const { method } = req.query as unknown as StartConnectionQuery;
  const { authorizationUrl, expiresAt, browserBinding } =
    await SocialAccountService.startConnection(getWorkspaceContext(req), platform, method);
  setSocialOAuthCookie(res, platform, browserBinding, expiresAt);
  sendSuccess(res, {
    message: "Continue on the platform to connect your account",
    data: { authorizationUrl, expiresAt },
  });
};

/** Error codes shown by the frontend after the redirect (never raw platform messages). */
const CALLBACK_ERROR_REASONS: Partial<Record<string, string>> = {
  [ErrorCode.SOCIAL_OAUTH_STATE_INVALID]: "expired",
  [ErrorCode.SOCIAL_PERMISSION_DENIED]: "permission",
  [ErrorCode.FORBIDDEN]: "forbidden",
  [ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE]: "unavailable",
  [ErrorCode.RATE_LIMITED]: "rate_limited",
};

const socialAccountsPageUrl = (platform: SocialPlatformValue, params: Record<string, string>) => {
  const url = new URL(FRONTEND_SOCIAL_ACCOUNTS_PATH, env.FRONTEND_URL);
  url.searchParams.set("platform", platformSlug(platform));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
};

/** The platform redirects the browser here; the outcome is shown on the Social Accounts page. */
export const HandleOAuthCallback = async (req: Request, res: Response) => {
  const { platform } = req.params as unknown as SocialPlatformParams;
  const { code, state, error, error_reason: errorReason } = req.query as OAuthCallbackQuery;
  const browserBinding = getSocialOAuthCookie(req, platform);
  clearSocialOAuthCookie(res, platform);
  const finish = (params: Record<string, string>) =>
    res.redirect(HttpStatus.SEE_OTHER, socialAccountsPageUrl(platform, params));

  if (error || !code || !state) {
    if (state) await SocialAccountService.abandonConnection(platform, state);
    const cancelled = error?.startsWith("user_cancelled") || errorReason === "user_denied";
    finish({ error: cancelled ? "cancelled" : "failed" });
    return;
  }

  try {
    const { workspaceId, selection } = await SocialAccountService.completeConnection({
      platform,
      code,
      state,
      browserBinding,
    });
    // Several accounts were granted: the page asks which one to connect.
    finish(
      selection ? { choose: selection.draftId, workspaceId } : { connected: "1", workspaceId },
    );
  } catch (failure) {
    if (failure instanceof AppError && failure.isOperational) {
      req.log.warn({ err: failure, platform }, "Social account connection failed");
    } else {
      req.log.error({ err: failure, platform }, "Social account connection failed unexpectedly");
    }
    const reason =
      failure instanceof AppError ? (CALLBACK_ERROR_REASONS[failure.code] ?? "failed") : "failed";
    finish({ error: reason });
  }
};

/** The accounts a pending authorization could connect, for the picker. */
export const ListConnectionChoices = async (req: Request, res: Response) => {
  const { draftId } = req.params as unknown as ConnectionDraftParams;
  const data = await SocialAccountService.listConnectionChoices(getWorkspaceContext(req), draftId);
  sendSuccess(res, { message: "Choose an account to connect", data });
};

export const ChooseConnectionTarget = async (req: Request, res: Response) => {
  const { draftId } = req.params as unknown as ConnectionDraftParams;
  const { targetId } = req.body as ChooseConnectionTargetInput;
  const account = await SocialAccountService.completeConnectionChoice(
    getWorkspaceContext(req),
    draftId,
    targetId,
  );
  sendSuccess(res, { message: "Account connected", data: { account } });
};

export const DisconnectSocialAccount = async (req: Request, res: Response) => {
  const { accountId } = req.params as SocialAccountIdParams;
  await SocialAccountService.disconnectAccount(getWorkspaceContext(req), accountId);
  sendSuccess(res, { message: "Account disconnected", data: null });
};

export const TestSocialAccount = async (req: Request, res: Response) => {
  const { accountId } = req.params as SocialAccountIdParams;
  const data = await SocialAccountService.testConnection(getWorkspaceContext(req), accountId);
  sendSuccess(res, { message: "The connection is working", data });
};

export const PublishSocialPost = async (req: Request, res: Response) => {
  const { accountId } = req.params as SocialAccountIdParams;
  const post = await SocialAccountService.publishPost(
    getWorkspaceContext(req),
    accountId,
    req.body as PublishSocialPostInput,
  );
  sendSuccess(res, { statusCode: HttpStatus.CREATED, message: "Post published", data: { post } });
};
