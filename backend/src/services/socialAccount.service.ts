import { timingSafeEqual } from "node:crypto";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  API_V1_PREFIX,
  ErrorCode,
  type ErrorCodeValue,
  HttpStatus,
} from "../constants/http.constant";
import {
  platformSlug,
  SocialAccountStatus,
  type SocialAccountStatusValue,
  type SocialPlatformValue,
} from "../constants/social.constant";
import { WorkspaceRole, WorkspaceStatus } from "../constants/workspace.constant";
import {
  CAPABILITY_LABELS,
  requiredCapabilityForImages,
  requiredCapabilityForVideo,
  type SocialCapability,
} from "../integrations/social/capabilities";
import {
  SocialProviderError,
  type SocialProviderErrorKindValue,
} from "../integrations/social/errors";
import type { SocialProvider } from "../integrations/social/provider";
import { getSocialProviderRegistry } from "../integrations/social/registry";
import type {
  AnalyticsQuery,
  AnalyticsResult,
  MediaAsset,
  OAuthTokenSet,
  ProviderCredentials,
  ProviderPost,
  PublishImageInput,
  PublishResult,
  PublishTextInput,
  PublishVideoInput,
  SocialProfile,
} from "../integrations/social/types";
import { StoredFile } from "../models/file.model";
import {
  type PublicSocialAccount,
  SocialAccount,
  type SocialAccountDocument,
  toPublicSocialAccount,
} from "../models/socialAccount.model";
import { SocialOAuthState, type SocialOAuthStateDocument } from "../models/socialOAuthState.model";
import { User } from "../models/user.model";
import { Workspace } from "../models/workspace.model";
import { WorkspaceMember } from "../models/workspaceMember.model";
import { AppError } from "../utils/appError.util";
import { getTokenSecretBox, type SecretBox } from "../utils/encryption.util";
import { getStorage } from "../utils/storage.util";
import { generateOpaqueToken, hashToken } from "../utils/token.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import { hasMinimumRole } from "../utils/workspaceRoles.util";

/** Refresh tokens that expire within this window before using them. */
const TOKEN_REFRESH_LEEWAY_MS = 5 * 60_000;
const SECRET_LIKE_KEY = /token|secret|password|credential/i;

// ── Errors ─────────────────────────────────────────────────

const PROVIDER_ERROR_RESPONSES: Record<
  SocialProviderErrorKindValue,
  { status: number; code: ErrorCodeValue }
> = {
  NOT_CONFIGURED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE,
  },
  NOT_IMPLEMENTED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE,
  },
  UNSUPPORTED_CAPABILITY: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: ErrorCode.SOCIAL_CAPABILITY_UNSUPPORTED,
  },
  INVALID_REQUEST: { status: HttpStatus.BAD_REQUEST, code: ErrorCode.SOCIAL_INVALID_REQUEST },
  TOKEN_EXPIRED: { status: HttpStatus.CONFLICT, code: ErrorCode.SOCIAL_REAUTH_REQUIRED },
  REAUTH_REQUIRED: { status: HttpStatus.CONFLICT, code: ErrorCode.SOCIAL_REAUTH_REQUIRED },
  PERMISSION_DENIED: { status: HttpStatus.FORBIDDEN, code: ErrorCode.SOCIAL_PERMISSION_DENIED },
  ACCOUNT_RESTRICTED: { status: HttpStatus.CONFLICT, code: ErrorCode.SOCIAL_ACCOUNT_ERROR },
  RATE_LIMITED: { status: HttpStatus.TOO_MANY_REQUESTS, code: ErrorCode.RATE_LIMITED },
  PROVIDER_ERROR: { status: HttpStatus.BAD_GATEWAY, code: ErrorCode.SOCIAL_PROVIDER_ERROR },
};

/** How a provider failure changes the stored account. Other kinds leave the status alone. */
const STATUS_AFTER_FAILURE: Partial<
  Record<SocialProviderErrorKindValue, SocialAccountStatusValue>
> = {
  TOKEN_EXPIRED: SocialAccountStatus.EXPIRED,
  REAUTH_REQUIRED: SocialAccountStatus.REAUTH_REQUIRED,
  PERMISSION_DENIED: SocialAccountStatus.REAUTH_REQUIRED,
  ACCOUNT_RESTRICTED: SocialAccountStatus.ERROR,
};

const toAppError = (error: SocialProviderError): AppError => {
  const { status, code } = PROVIDER_ERROR_RESPONSES[error.kind];
  return new AppError(error.message, status, {
    code,
    isOperational: true,
    cause: error,
    details: {
      platform: error.platform,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    },
  });
};

const reauthRequired = (provider: SocialProvider) =>
  new AppError(`Reconnect your ${provider.displayName} account to continue.`, HttpStatus.CONFLICT, {
    code: ErrorCode.SOCIAL_REAUTH_REQUIRED,
    details: { platform: provider.platform },
  });

const invalidState = () =>
  AppError.badRequest(
    "This connection request is invalid or has expired. Please try connecting again.",
    undefined,
    ErrorCode.SOCIAL_OAUTH_STATE_INVALID,
  );

/** Runs a provider call outside an account (OAuth), translating provider errors. */
const callProvider = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw error instanceof SocialProviderError ? toAppError(error) : error;
  }
};

// ── Helpers ────────────────────────────────────────────────

const requireSecretBox = (): SecretBox => {
  const box = getTokenSecretBox();
  if (!box) {
    throw new AppError(
      "Social integrations are not configured on this server",
      HttpStatus.SERVICE_UNAVAILABLE,
      { code: ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE, isOperational: true },
    );
  }
  return box;
};

const getProvider = (platform: SocialPlatformValue): SocialProvider => {
  try {
    return getSocialProviderRegistry().get(platform);
  } catch (error) {
    throw error instanceof SocialProviderError ? toAppError(error) : error;
  }
};

const getAvailableProvider = (platform: SocialPlatformValue): SocialProvider => {
  const provider = getProvider(platform);
  if (!provider.isAvailable()) {
    throw new AppError(
      `${provider.displayName} can't be connected yet`,
      HttpStatus.SERVICE_UNAVAILABLE,
      { code: ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE, isOperational: true, details: { platform } },
    );
  }
  return provider;
};

export const assertCapability = (provider: SocialProvider, capability: SocialCapability) => {
  if (!provider.supports(capability)) {
    throw new AppError(
      `${provider.displayName} doesn't support ${CAPABILITY_LABELS[capability]}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      {
        code: ErrorCode.SOCIAL_CAPABILITY_UNSUPPORTED,
        details: { platform: provider.platform, capability },
      },
    );
  }
};

const capabilitiesFor = (platform: SocialPlatformValue): SocialCapability[] => {
  const registry = getSocialProviderRegistry();
  return registry.has(platform) ? [...registry.get(platform).capabilities] : [];
};

const toPublic = (account: SocialAccountDocument) =>
  toPublicSocialAccount(account, capabilitiesFor(account.platform));

/** Additional authenticated data: a ciphertext only decrypts for this account and field. */
const tokenContext = (
  account: { workspace: Types.ObjectId; platform: string; providerAccountId: string },
  field: "access" | "refresh",
) =>
  `social-account:${account.workspace.toString()}:${account.platform}:${account.providerAccountId}:${field}`;

const codeVerifierContext = (state: SocialOAuthStateDocument) =>
  `social-oauth-state:${state._id.toString()}`;

/** Where the platform sends the browser back: the API callback (proxied in development). */
const callbackUrlFor = (provider: SocialProvider) =>
  provider.oauth.redirectUri ??
  new URL(
    `${API_V1_PREFIX}/social-accounts/${platformSlug(provider.platform)}/callback`,
    env.FRONTEND_URL,
  ).toString();

const safeEqualHex = (left: string, right: string) => {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

const safeHttpUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Drops secret-looking keys in case a provider puts them in metadata by mistake. */
const sanitizeMetadata = (metadata: Record<string, unknown> | undefined) =>
  Object.fromEntries(Object.entries(metadata ?? {}).filter(([key]) => !SECRET_LIKE_KEY.test(key)));

const applyProfile = (account: SocialAccountDocument, profile: SocialProfile) => {
  account.set({
    accountName: profile.accountName.slice(0, 256),
    username: profile.username?.slice(0, 256) ?? null,
    profileImage: safeHttpUrl(profile.profileImage),
    metadata: sanitizeMetadata(profile.metadata),
  });
};

const applyTokens = (
  account: SocialAccountDocument,
  tokens: OAuthTokenSet,
  box: SecretBox,
  { keepRefreshToken }: { keepRefreshToken: boolean },
) => {
  if (!tokens.accessToken) {
    throw new SocialProviderError("PROVIDER_ERROR", "The platform didn't return an access token", {
      platform: account.platform,
    });
  }
  account.encryptedAccessToken = box.encrypt(tokens.accessToken, tokenContext(account, "access"));
  if (tokens.refreshToken) {
    account.encryptedRefreshToken = box.encrypt(
      tokens.refreshToken,
      tokenContext(account, "refresh"),
    );
    account.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt ?? null;
  } else if (!keepRefreshToken) {
    account.encryptedRefreshToken = null;
    account.refreshTokenExpiresAt = null;
  }
  account.tokenExpiresAt = tokens.expiresAt ?? null;
  if (tokens.scopes.length > 0 || !keepRefreshToken) account.set("scopes", tokens.scopes);
};

const recordFailure = async (
  account: SocialAccountDocument,
  failure: { code: string; message: string },
  status?: SocialAccountStatusValue,
) => {
  if (status) account.status = status;
  account.lastError = {
    code: failure.code.slice(0, 100),
    message: failure.message.slice(0, 500),
    occurredAt: new Date(),
  };
  await account.save();
};

/** Records what a provider failure means for the account, then throws the API error. */
const handleProviderFailure = async (
  account: SocialAccountDocument,
  error: unknown,
): Promise<never> => {
  if (!(error instanceof SocialProviderError)) throw error;
  if (error.kind !== "UNSUPPORTED_CAPABILITY" && error.kind !== "INVALID_REQUEST") {
    await recordFailure(
      account,
      { code: error.kind, message: error.message },
      STATUS_AFTER_FAILURE[error.kind],
    );
  }
  throw toAppError(error);
};

// ── Tokens ─────────────────────────────────────────────────

const refreshTokens = async (
  account: SocialAccountDocument,
  provider: SocialProvider,
  box: SecretBox,
) => {
  const encryptedRefreshToken = account.encryptedRefreshToken;
  const refreshTokenExpired =
    account.refreshTokenExpiresAt !== null &&
    account.refreshTokenExpiresAt !== undefined &&
    account.refreshTokenExpiresAt.getTime() <= Date.now();

  if (!provider.supports("TOKEN_REFRESH") || !encryptedRefreshToken || refreshTokenExpired) {
    await recordFailure(
      account,
      { code: "TOKEN_EXPIRED", message: `The ${provider.displayName} connection has expired.` },
      SocialAccountStatus.EXPIRED,
    );
    throw reauthRequired(provider);
  }

  let refreshToken: string;
  try {
    refreshToken = box.decrypt(encryptedRefreshToken, tokenContext(account, "refresh"));
  } catch (error) {
    logger.error(
      { err: error, accountId: account.id },
      "Stored refresh token could not be decrypted",
    );
    await recordFailure(
      account,
      { code: "TOKEN_DECRYPTION_FAILED", message: "Stored credentials couldn't be read." },
      SocialAccountStatus.REAUTH_REQUIRED,
    );
    throw reauthRequired(provider);
  }

  try {
    const tokens = await provider.refreshAccessToken(refreshToken);
    applyTokens(account, tokens, box, { keepRefreshToken: true });
    account.set({
      status: SocialAccountStatus.CONNECTED,
      lastRefreshedAt: new Date(),
      lastError: null,
    });
    await account.save();
  } catch (error) {
    // A failed refresh means the user has to reconnect, whatever the platform said.
    if (error instanceof SocialProviderError && error.kind === "TOKEN_EXPIRED") {
      return handleProviderFailure(
        account,
        new SocialProviderError("REAUTH_REQUIRED", error.message, { platform: error.platform }),
      );
    }
    return handleProviderFailure(account, error);
  }
};

/** Re-encrypts stored tokens with the current key after a key rotation. */
const rotateEncryption = async (
  account: SocialAccountDocument,
  box: SecretBox,
  accessToken: string,
) => {
  account.encryptedAccessToken = box.encrypt(accessToken, tokenContext(account, "access"));
  if (account.encryptedRefreshToken) {
    try {
      const refreshToken = box.decrypt(
        account.encryptedRefreshToken,
        tokenContext(account, "refresh"),
      );
      account.encryptedRefreshToken = box.encrypt(refreshToken, tokenContext(account, "refresh"));
    } catch {
      // Left as is: the next refresh fails and asks the user to reconnect.
    }
  }
  await account.save();
};

/** Decrypted credentials for one operation, refreshing first when the token is (nearly) expired. */
const getCredentials = async (
  account: SocialAccountDocument,
  provider: SocialProvider,
): Promise<ProviderCredentials> => {
  const box = requireSecretBox();

  if (account.status === SocialAccountStatus.DISCONNECTED) {
    throw new AppError(
      "This account has been disconnected. Connect it again to continue.",
      HttpStatus.CONFLICT,
      { code: ErrorCode.SOCIAL_ACCOUNT_DISCONNECTED },
    );
  }
  if (account.status === SocialAccountStatus.ERROR) {
    throw new AppError(
      `${provider.displayName} reported a problem with this account. Reconnect it to continue.`,
      HttpStatus.CONFLICT,
      { code: ErrorCode.SOCIAL_ACCOUNT_ERROR },
    );
  }
  if (account.status === SocialAccountStatus.REAUTH_REQUIRED || !account.encryptedAccessToken) {
    throw reauthRequired(provider);
  }

  const expiresAt = account.tokenExpiresAt?.getTime();
  const expiresSoon = expiresAt !== undefined && expiresAt - Date.now() <= TOKEN_REFRESH_LEEWAY_MS;
  if (account.status === SocialAccountStatus.EXPIRED || expiresSoon) {
    await refreshTokens(account, provider, box);
  }

  const encryptedAccessToken = account.encryptedAccessToken;
  if (!encryptedAccessToken) throw reauthRequired(provider);

  let accessToken: string;
  try {
    accessToken = box.decrypt(encryptedAccessToken, tokenContext(account, "access"));
  } catch (error) {
    logger.error(
      { err: error, accountId: account.id },
      "Stored access token could not be decrypted",
    );
    await recordFailure(
      account,
      { code: "TOKEN_DECRYPTION_FAILED", message: "Stored credentials couldn't be read." },
      SocialAccountStatus.REAUTH_REQUIRED,
    );
    throw reauthRequired(provider);
  }

  if (box.needsRotation(encryptedAccessToken)) await rotateEncryption(account, box, accessToken);

  return {
    accessToken,
    providerAccountId: account.providerAccountId,
    metadata: { ...account.metadata },
  };
};

type AccountOperation<T> = (
  provider: SocialProvider,
  credentials: ProviderCredentials,
  account: SocialAccountDocument,
) => Promise<T>;

/** Loads a workspace account, checks the capability, gets credentials and runs the operation. */
const withAccount = async <T>(
  { workspace }: WorkspaceContext,
  accountId: string,
  capability: SocialCapability | null,
  operation: AccountOperation<T>,
): Promise<T> => {
  const account = await SocialAccount.findOne({ _id: accountId, workspace: workspace._id }).select(
    "+encryptedAccessToken +encryptedRefreshToken",
  );
  if (!account) throw AppError.notFound("Social account not found");

  const provider = getProvider(account.platform);
  if (capability) assertCapability(provider, capability);
  const credentials = await getCredentials(account, provider);

  try {
    return await operation(provider, credentials, account);
  } catch (error) {
    return handleProviderFailure(account, error);
  }
};

// ── Platforms and accounts ─────────────────────────────────

export interface PublicSocialPlatform {
  platform: SocialPlatformValue;
  displayName: string;
  available: boolean;
  capabilities: SocialCapability[];
}

export const listPlatforms = (): PublicSocialPlatform[] =>
  getSocialProviderRegistry()
    .list()
    .map((provider) => ({
      platform: provider.platform,
      displayName: provider.displayName,
      available: provider.isAvailable(),
      capabilities: [...provider.capabilities],
    }));

export const listAccounts = async (workspaceId: Types.ObjectId): Promise<PublicSocialAccount[]> => {
  const accounts = await SocialAccount.find({
    workspace: workspaceId,
    status: { $ne: SocialAccountStatus.DISCONNECTED },
  }).sort({ platform: 1, accountName: 1 });
  return accounts.map(toPublic);
};

/** Which workspace owns an account, so routes can authorize it with requireWorkspace(). */
export const findAccountWorkspaceId = async (accountId: string): Promise<string | undefined> => {
  const account = await SocialAccount.findById(accountId)
    .select("workspace")
    // Only resolves which workspace to authorize; requireWorkspace() then checks membership.
    .setOptions({ skipWorkspaceScope: true });
  return account?.workspace.toString();
};

// ── OAuth ──────────────────────────────────────────────────

export interface StartedConnection {
  authorizationUrl: string;
  expiresAt: Date;
  /** Random value for an httpOnly cookie; the callback must present the same value. */
  browserBinding: string;
}

/** Starts OAuth: stores a hashed, single-use state and returns the platform's consent URL. */
export const startConnection = async (
  { workspace, user }: WorkspaceContext,
  platform: SocialPlatformValue,
): Promise<StartedConnection> => {
  const box = requireSecretBox();
  const provider = getAvailableProvider(platform);

  const state = generateOpaqueToken(32);
  const browserBinding = generateOpaqueToken(32);
  const oauthState = new SocialOAuthState({
    workspace: workspace._id,
    user: user._id,
    platform,
    stateHash: hashToken(state),
    bindingHash: hashToken(browserBinding),
    redirectUri: callbackUrlFor(provider),
    expiresAt: new Date(Date.now() + env.SOCIAL_OAUTH_STATE_TTL_MINUTES * 60_000),
  });

  const request = await callProvider(() =>
    provider.getAuthorizationUrl({ state, redirectUri: oauthState.redirectUri }),
  );
  if (new URL(request.url).protocol !== "https:") {
    throw AppError.internal(`${provider.displayName} returned a non-HTTPS authorization URL`);
  }
  if (provider.oauth.usesPkce && !request.codeVerifier) {
    throw AppError.internal(`${provider.displayName} uses PKCE but returned no code verifier`);
  }
  if (request.codeVerifier) {
    oauthState.encryptedCodeVerifier = box.encrypt(
      request.codeVerifier,
      codeVerifierContext(oauthState),
    );
  }
  await oauthState.save();

  return { authorizationUrl: request.url, expiresAt: oauthState.expiresAt, browserBinding };
};

/** Atomically consumes an unexpired state so it can only be used once. */
const claimState = (platform: SocialPlatformValue, state: string) =>
  SocialOAuthState.findOneAndUpdate(
    {
      platform,
      stateHash: hashToken(state),
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { returnDocument: "after" },
  )
    // The workspace is only known once the state resolves; the state itself is the secret.
    .setOptions({ skipWorkspaceScope: true })
    .select("+encryptedCodeVerifier +bindingHash");

/** The user cancelled on the platform: burn the state so it can't be reused. */
export const abandonConnection = async (platform: SocialPlatformValue, state: string) => {
  await claimState(platform, state);
};

/** Re-checks, at callback time, that the user may still connect accounts in the workspace. */
const loadConnectionContext = async (oauthState: SocialOAuthStateDocument) => {
  const [user, workspace, member] = await Promise.all([
    User.findById(oauthState.user),
    Workspace.findById(oauthState.workspace),
    WorkspaceMember.findOne({ workspace: oauthState.workspace, user: oauthState.user }),
  ]);
  if (
    !user ||
    !workspace ||
    workspace.status !== WorkspaceStatus.ACTIVE ||
    !member ||
    !hasMinimumRole(member.role, WorkspaceRole.ADMIN)
  ) {
    throw AppError.forbidden("You no longer have permission to connect accounts in this workspace");
  }
  return { user, workspace };
};

export interface CompleteConnectionInput {
  platform: SocialPlatformValue;
  code: string;
  state: string;
  /** Cookie value from the browser that started the flow. */
  browserBinding: string | undefined;
}

/**
 * Finishes OAuth in the browser that started it, for the user and workspace that
 * started it, then stores the account with encrypted tokens.
 */
export const completeConnection = async ({
  platform,
  code,
  state,
  browserBinding,
}: CompleteConnectionInput): Promise<{ account: PublicSocialAccount; workspaceId: string }> => {
  const box = requireSecretBox();
  const provider = getAvailableProvider(platform);

  const oauthState = await claimState(platform, state);
  // Binding the flow to the browser stops someone sending another person a consent link
  // that would connect that person's account to the sender's workspace.
  if (
    !oauthState ||
    !browserBinding ||
    !safeEqualHex(hashToken(browserBinding), oauthState.bindingHash)
  ) {
    throw invalidState();
  }

  const { user, workspace } = await loadConnectionContext(oauthState);

  const codeVerifier = oauthState.encryptedCodeVerifier
    ? box.decrypt(oauthState.encryptedCodeVerifier, codeVerifierContext(oauthState))
    : undefined;

  const { tokens, profile } = await callProvider(() =>
    provider.handleOAuthCallback({ code, redirectUri: oauthState.redirectUri, codeVerifier }),
  );
  if (!profile.providerAccountId || !profile.accountName) {
    throw toAppError(
      new SocialProviderError(
        "PROVIDER_ERROR",
        `${provider.displayName} returned an incomplete profile`,
        { platform },
      ),
    );
  }

  const account =
    (await SocialAccount.findOne({
      workspace: workspace._id,
      platform,
      providerAccountId: profile.providerAccountId,
    })) ??
    new SocialAccount({
      workspace: workspace._id,
      platform,
      providerAccountId: profile.providerAccountId,
    });

  applyProfile(account, profile);
  try {
    applyTokens(account, tokens, box, { keepRefreshToken: false });
  } catch (error) {
    throw error instanceof SocialProviderError ? toAppError(error) : error;
  }
  account.set({
    status: SocialAccountStatus.CONNECTED,
    connectedBy: user._id,
    lastConnectedAt: new Date(),
    lastCheckedAt: new Date(),
    disconnectedAt: null,
    lastError: null,
  });
  await account.save();
  await SocialOAuthState.deleteOne({ _id: oauthState._id, workspace: workspace._id });

  logger.info(
    { userId: user.id, workspaceId: workspace.id, platform, accountId: account.id },
    "Social account connected",
  );
  return { account: toPublic(account), workspaceId: workspace.id };
};

/**
 * Deletes stored tokens and hides the account. Reconnecting restores the same record.
 * Platforms without a revocation API (e.g. LinkedIn) keep the app authorized until the
 * member removes it in their platform settings or the token expires.
 */
export const disconnectAccount = async (
  { workspace, user }: WorkspaceContext,
  accountId: string,
): Promise<void> => {
  const account = await SocialAccount.findOne({ _id: accountId, workspace: workspace._id });
  if (!account || account.status === SocialAccountStatus.DISCONNECTED) {
    throw AppError.notFound("Social account not found");
  }
  account.set({
    status: SocialAccountStatus.DISCONNECTED,
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    disconnectedAt: new Date(),
  });
  await account.save();
  logger.info(
    { userId: user.id, workspaceId: workspace.id, accountId },
    "Social account disconnected",
  );
};

/** Calls the platform with the stored credentials and refreshes the profile. Publishes nothing. */
export const testConnection = (
  context: WorkspaceContext,
  accountId: string,
): Promise<{ account: PublicSocialAccount; checkedAt: Date }> =>
  withAccount(context, accountId, null, async (provider, credentials, account) => {
    const profile = await provider.getProfile(credentials);
    if (profile.providerAccountId !== account.providerAccountId) {
      throw new SocialProviderError(
        "REAUTH_REQUIRED",
        "These credentials belong to a different account. Reconnect it.",
        { platform: provider.platform },
      );
    }
    const checkedAt = new Date();
    applyProfile(account, profile);
    account.set({
      status: SocialAccountStatus.CONNECTED,
      lastCheckedAt: checkedAt,
      lastError: null,
    });
    await account.save();
    return { account: toPublic(account), checkedAt };
  });

// ── Publishing and analytics ───────────────────────────────

export const publishText = (
  context: WorkspaceContext,
  accountId: string,
  input: PublishTextInput,
): Promise<PublishResult> =>
  withAccount(context, accountId, "TEXT_POST", (provider, credentials) =>
    provider.publishText(credentials, input),
  );

// async so validation failures reject like every other operation instead of throwing synchronously.
export const publishImage = async (
  context: WorkspaceContext,
  accountId: string,
  input: PublishImageInput,
): Promise<PublishResult> => {
  if (input.images.length === 0) throw AppError.badRequest("Add at least one image");
  return withAccount(
    context,
    accountId,
    requiredCapabilityForImages(input.images.length),
    (provider, credentials) => provider.publishImage(credentials, input),
  );
};

export const publishVideo = (
  context: WorkspaceContext,
  accountId: string,
  input: PublishVideoInput,
): Promise<PublishResult> =>
  withAccount(
    context,
    accountId,
    requiredCapabilityForVideo(input.format),
    (provider, credentials) => provider.publishVideo(credentials, input),
  );

export interface PublishPostInput {
  text: string;
  /** Image from the workspace media library. */
  fileId?: string;
}

/** Publishes text, or text with one image from the media library, to a connected account. */
export const publishPost = async (
  context: WorkspaceContext,
  accountId: string,
  { text, fileId }: PublishPostInput,
): Promise<PublishResult> => {
  if (!fileId) return publishText(context, accountId, { text });

  const file = await StoredFile.findOne({ _id: fileId, workspace: context.workspace._id });
  if (!file) throw AppError.notFound("File not found");
  if (file.kind !== "image") {
    throw AppError.badRequest("Attach an image file", undefined, ErrorCode.SOCIAL_INVALID_REQUEST);
  }
  const image: MediaAsset = {
    url: file.url,
    mimeType: file.mimeType,
    size: file.size,
    read: () => getStorage().getObject(file.key),
  };
  return publishImage(context, accountId, { text: text || undefined, images: [image] });
};

export const getPost = (
  context: WorkspaceContext,
  accountId: string,
  providerPostId: string,
): Promise<ProviderPost> =>
  withAccount(context, accountId, "READ_POST", (provider, credentials) =>
    provider.getPost(credentials, providerPostId),
  );

export const deletePost = (
  context: WorkspaceContext,
  accountId: string,
  providerPostId: string,
): Promise<void> =>
  withAccount(context, accountId, "DELETE_POST", (provider, credentials) =>
    provider.deletePost(credentials, providerPostId),
  );

export const getAnalytics = (
  context: WorkspaceContext,
  accountId: string,
  query: AnalyticsQuery = {},
): Promise<AnalyticsResult> =>
  withAccount(context, accountId, "ANALYTICS", (provider, credentials) =>
    provider.getAnalytics(credentials, query),
  );

export const deleteWorkspaceSocialData = async (workspaceId: Types.ObjectId): Promise<void> => {
  await Promise.all([
    SocialAccount.deleteMany({ workspace: workspaceId }),
    SocialOAuthState.deleteMany({ workspace: workspaceId }),
  ]);
};
