import { env } from "../../../config/env";
import type { SocialCapability } from "../capabilities";
import { SocialProviderError, type SocialProviderErrorKindValue } from "../errors";
import { type FetchLike, isRecord, providerFetch, readJson, retryAfterSeconds } from "../http";
import { BaseSocialProvider } from "../provider";
import type {
  AuthorizationRequest,
  AuthorizationRequestInput,
  OAuthCallbackInput,
  OAuthConnection,
  OAuthTokenSet,
  ProviderCredentials,
  ProviderOAuthConfig,
  PublishImageInput,
  PublishResult,
  PublishTextInput,
  SocialProfile,
} from "../types";
import { asBody } from "../http";

/**
 * LinkedIn member profiles, using only self-serve products:
 * - "Sign In with LinkedIn using OpenID Connect" (`openid`, `profile`) for the connected profile.
 * - "Share on LinkedIn" (`w_member_social`) for text posts (Posts API) and single-image
 *   posts. Images use the unversioned v2 Assets and UGC Posts APIs: the versioned
 *   `/rest/assets` upload is partner-only and answers 403 for self-serve apps.
 *
 * Not supported, because they need LinkedIn approval or other products:
 * - Company pages (Community Management API: `w_organization_social`).
 * - Reading posts (`r_member_social`) and post analytics.
 * - Programmatic refresh tokens, which only approved partners receive.
 *
 * Without a refresh token, access tokens last 60 days and the member reconnects.
 * Docs: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
 */

const AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const REST_API_URL = "https://api.linkedin.com/rest";
const V2_API_URL = "https://api.linkedin.com/v2";

export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];
const POSTING_SCOPE = "w_member_social";
export const LINKEDIN_MAX_POST_LENGTH = 3000;
/** Image formats accepted for feed-share images. */
export const LINKEDIN_IMAGE_TYPES = ["image/jpeg", "image/png"];
const IMAGE_RECIPE = "urn:li:digitalmediaRecipe:feedshare-image";
const ASSET_URN = /^urn:li:digitalmediaAsset:([A-Za-z0-9_-]+)$/;
const POST_URN = /^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
/** Characters reserved by LinkedIn's "little" text format (Posts API commentary). */
const LITTLE_RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/**
 * Escapes reserved characters so commentary is published literally. `#word` is
 * kept as a hashtag; mentions aren't supported, so `@` is always escaped.
 */
export const escapeLittleText = (text: string): string =>
  text.replace(LITTLE_RESERVED, (character: string, offset: number) => {
    const isHashtag =
      character === "#" &&
      WORD_CHARACTER.test(text[offset + 1] ?? "") &&
      !WORD_CHARACTER.test(text[offset - 1] ?? "");
    return isHashtag ? character : `\\${character}`;
  });

/** Upload URLs come from LinkedIn's response; the access token is only ever sent to LinkedIn. */
const isLinkedInUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))
    );
  } catch {
    return false;
  }
};

const describeLinkedInError = (body: unknown): string | null => {
  if (!isRecord(body)) return null;
  const message =
    typeof body.message === "string"
      ? body.message
      : typeof body.error_description === "string"
        ? body.error_description
        : null;
  return message ? message.replace(/\s+/g, " ").trim().slice(0, 200) : null;
};

type RequestContext = "token-exchange" | "token-refresh" | "api";

export interface LinkedInProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  apiVersion: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

export class LinkedInProvider extends BaseSocialProvider {
  readonly platform = "LINKEDIN" as const;
  readonly displayName = "LinkedIn";
  readonly capabilities: ReadonlySet<SocialCapability> = new Set<SocialCapability>([
    "TEXT_POST",
    "IMAGE_POST",
    // Used only when LinkedIn issues a refresh token (approved partners).
    "TOKEN_REFRESH",
  ]);
  readonly oauth: ProviderOAuthConfig;
  private readonly config: LinkedInProviderConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: LinkedInProviderConfig) {
    super();
    this.config = config;
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.oauth = { scopes: [...LINKEDIN_SCOPES], usesPkce: false, redirectUri: config.redirectUri };
  }

  isAvailable(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  private now() {
    return this.config.now?.() ?? new Date();
  }

  private error(kind: SocialProviderErrorKindValue, message: string, retryable?: boolean) {
    return new SocialProviderError(kind, message, { platform: this.platform, retryable });
  }

  private clientCredentials() {
    const { clientId, clientSecret } = this.config;
    if (!clientId || !clientSecret) {
      throw this.error("NOT_CONFIGURED", "LinkedIn isn't configured on this server");
    }
    return { clientId, clientSecret };
  }

  /** Unversioned v2 endpoints (image uploads and UGC posts) take no LinkedIn-Version header. */
  private v2Headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    };
  }

  private restHeaders(accessToken: string, contentType?: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": this.config.apiVersion,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(contentType ? { "Content-Type": contentType } : {}),
    };
  }

  private async send(url: string, init: RequestInit, context: RequestContext): Promise<Response> {
    const response = await providerFetch(this.fetchImpl, this, url, init, this.config.timeoutMs);
    if (response.ok) return response;
    throw await this.toProviderError(response, context);
  }

  private async toProviderError(
    response: Response,
    context: RequestContext,
  ): Promise<SocialProviderError> {
    const { status } = response;
    const detail = describeLinkedInError(await readJson(response));
    const serverError = status >= 500;

    if (context === "token-exchange") {
      return serverError
        ? this.error(
            "PROVIDER_ERROR",
            "LinkedIn couldn't complete sign-in. Please try again.",
            true,
          )
        : this.error(
            "INVALID_REQUEST",
            "LinkedIn rejected the authorization. Please connect again.",
          );
    }
    if (context === "token-refresh") {
      // Busy or throttled isn't a revoked login: keep the account connected and retry later.
      if (status === 429 || status === 408) {
        return new SocialProviderError("RATE_LIMITED", "LinkedIn is busy. Try again shortly.", {
          platform: this.platform,
          retryable: true,
        });
      }
      return serverError
        ? this.error("PROVIDER_ERROR", "LinkedIn couldn't refresh access. Please try again.", true)
        : this.error("REAUTH_REQUIRED", "LinkedIn access has expired. Reconnect your account.");
    }
    if (status === 401) {
      return this.error("TOKEN_EXPIRED", "LinkedIn access has expired or was revoked.");
    }
    if (status === 403) {
      return this.error(
        "PERMISSION_DENIED",
        detail
          ? `LinkedIn denied this action: ${detail}`
          : "LinkedIn denied this action. Reconnect the account and approve posting permissions.",
      );
    }
    if (status === 429) {
      return new SocialProviderError(
        "RATE_LIMITED",
        "LinkedIn's rate limit was reached. Please try again later.",
        { platform: this.platform, retryAfterSeconds: retryAfterSeconds(response) },
      );
    }
    if (status >= 400 && status < 500 && status !== 408 && status !== 409) {
      return this.error(
        "INVALID_REQUEST",
        detail ? `LinkedIn rejected the request: ${detail}` : "LinkedIn rejected the request.",
      );
    }
    return this.error(
      "PROVIDER_ERROR",
      `LinkedIn returned an error (${status}). Please try again.`,
      true,
    );
  }

  // ── OAuth ────────────────────────────────────────────────

  async getAuthorizationUrl({
    state,
    redirectUri,
  }: AuthorizationRequestInput): Promise<AuthorizationRequest> {
    const { clientId } = this.clientCredentials();
    const params: Record<string, string> = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: this.oauth.scopes.join(" "),
    };
    // encodeURIComponent keeps spaces as %20, as LinkedIn documents for `scope`.
    const query = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");
    return { url: `${AUTHORIZATION_URL}?${query}` };
  }

  async handleOAuthCallback({ code, redirectUri }: OAuthCallbackInput): Promise<OAuthConnection> {
    const tokens = await this.requestTokens(
      { grant_type: "authorization_code", code, redirect_uri: redirectUri },
      "token-exchange",
    );
    if (tokens.scopes.length > 0 && !tokens.scopes.includes(POSTING_SCOPE)) {
      throw this.error(
        "PERMISSION_DENIED",
        "LinkedIn didn't grant permission to post. Check that the app has the Share on LinkedIn product, then connect again.",
      );
    }
    const profile = await this.fetchProfile(tokens.accessToken);
    return { tokens, profile };
  }

  override async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    return this.requestTokens(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      "token-refresh",
    );
  }

  private async requestTokens(
    params: Record<string, string>,
    context: "token-exchange" | "token-refresh",
  ): Promise<OAuthTokenSet> {
    const { clientId, clientSecret } = this.clientCredentials();
    const response = await this.send(
      TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
      },
      context,
    );

    const data = await readJson(response);
    const body: Record<string, unknown> = isRecord(data) ? data : {};
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number.NaN;
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw this.error("PROVIDER_ERROR", "LinkedIn returned an unexpected token response.", true);
    }

    const now = this.now().getTime();
    const refreshToken =
      typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : undefined;
    const refreshExpiresIn =
      typeof body.refresh_token_expires_in === "number" ? body.refresh_token_expires_in : null;

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(now + expiresIn * 1000),
      refreshTokenExpiresAt:
        refreshToken && refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000) : null,
      scopes: typeof body.scope === "string" ? body.scope.split(/[\s,]+/).filter(Boolean) : [],
    };
  }

  // ── Profile ──────────────────────────────────────────────

  async getProfile(credentials: ProviderCredentials): Promise<SocialProfile> {
    return this.fetchProfile(credentials.accessToken);
  }

  private async fetchProfile(accessToken: string): Promise<SocialProfile> {
    const response = await this.send(
      USERINFO_URL,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      "api",
    );
    const data = await readJson(response);
    const body: Record<string, unknown> = isRecord(data) ? data : {};

    const memberId = typeof body.sub === "string" ? body.sub.trim() : "";
    if (!memberId) {
      throw this.error("PROVIDER_ERROR", "LinkedIn didn't return a member id.", true);
    }

    const names = [body.given_name, body.family_name].filter(
      (part): part is string => typeof part === "string" && part.trim().length > 0,
    );
    const accountName =
      (typeof body.name === "string" && body.name.trim()) || names.join(" ") || "LinkedIn member";
    const locale =
      typeof body.locale === "string"
        ? body.locale
        : isRecord(body.locale)
          ? [body.locale.language, body.locale.country]
              .filter((part): part is string => typeof part === "string")
              .join("-")
          : "";

    return {
      providerAccountId: memberId,
      accountName,
      // OpenID Connect doesn't return the member's vanity name.
      username: null,
      profileImage: typeof body.picture === "string" ? body.picture : null,
      metadata: {
        accountType: "member",
        authorUrn: `urn:li:person:${memberId}`,
        ...(locale ? { locale } : {}),
      },
    };
  }

  // ── Publishing ───────────────────────────────────────────

  private validateCommentary(text: string, { required }: { required: boolean }) {
    if (required && !text.trim()) {
      throw this.error("INVALID_REQUEST", "Write something to post.");
    }
    if ([...text].length > LINKEDIN_MAX_POST_LENGTH) {
      throw this.error(
        "INVALID_REQUEST",
        `LinkedIn posts can be up to ${LINKEDIN_MAX_POST_LENGTH.toLocaleString("en-US")} characters.`,
      );
    }
  }

  private published(postUrn: string): PublishResult {
    if (!POST_URN.test(postUrn)) {
      throw this.error("PROVIDER_ERROR", "LinkedIn didn't return the new post's id.");
    }
    return {
      providerPostId: postUrn,
      url: `https://www.linkedin.com/feed/update/${postUrn}/`,
      publishedAt: this.now(),
    };
  }

  private async createPost(credentials: ProviderCredentials, text: string): Promise<PublishResult> {
    const response = await this.send(
      `${REST_API_URL}/posts`,
      {
        method: "POST",
        headers: this.restHeaders(credentials.accessToken, "application/json"),
        body: JSON.stringify({
          author: `urn:li:person:${credentials.providerAccountId}`,
          commentary: escapeLittleText(text),
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      },
      "api",
    );

    return this.published(response.headers.get("x-restli-id") ?? "");
  }

  override async publishText(
    credentials: ProviderCredentials,
    { text }: PublishTextInput,
  ): Promise<PublishResult> {
    this.validateCommentary(text, { required: true });
    return this.createPost(credentials, text);
  }

  override async publishImage(
    credentials: ProviderCredentials,
    { text = "", images }: PublishImageInput,
  ): Promise<PublishResult> {
    const [image] = images;
    if (!image || images.length !== 1) {
      throw this.error("INVALID_REQUEST", "LinkedIn posts from FlowPost can include one image.");
    }
    if (!LINKEDIN_IMAGE_TYPES.includes(image.mimeType)) {
      throw this.error("INVALID_REQUEST", "LinkedIn image posts support JPG and PNG files.");
    }
    if (!image.read) {
      throw this.error("INVALID_REQUEST", "The image couldn't be read.");
    }
    this.validateCommentary(text, { required: false });

    const bytes = await image.read();
    if (bytes.length === 0) throw this.error("INVALID_REQUEST", "The image file is empty.");

    // 1. Register a synchronous upload so the image is processed before the post uses it.
    const registration = await this.send(
      `${V2_API_URL}/assets?action=registerUpload`,
      {
        method: "POST",
        headers: this.v2Headers(credentials.accessToken),
        body: JSON.stringify({
          registerUploadRequest: {
            owner: `urn:li:person:${credentials.providerAccountId}`,
            recipes: [IMAGE_RECIPE],
            serviceRelationships: [
              { identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" },
            ],
            supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
          },
        }),
      },
      "api",
    );
    const { uploadUrl, uploadHeaders, assetId } = this.parseUploadRegistration(
      await readJson(registration),
    );

    // 2. Upload the bytes.
    await this.send(
      uploadUrl,
      {
        method: "PUT",
        headers: {
          ...uploadHeaders,
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": image.mimeType,
        },
        body: asBody(bytes),
      },
      "api",
    );

    // 3. Create the post. UGC commentary is plain text, so nothing is escaped.
    const response = await this.send(
      `${V2_API_URL}/ugcPosts`,
      {
        method: "POST",
        headers: this.v2Headers(credentials.accessToken),
        body: JSON.stringify({
          author: `urn:li:person:${credentials.providerAccountId}`,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text },
              shareMediaCategory: "IMAGE",
              media: [
                {
                  status: "READY",
                  media: `urn:li:digitalmediaAsset:${assetId}`,
                  ...(image.altText ? { description: { text: image.altText.slice(0, 4086) } } : {}),
                },
              ],
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      },
      "api",
    );
    const body = await readJson(response);
    const bodyId = isRecord(body) && typeof body.id === "string" ? body.id : "";
    return this.published(response.headers.get("x-restli-id") ?? bodyId);
  }

  private parseUploadRegistration(data: unknown) {
    const value = isRecord(data) && isRecord(data.value) ? data.value : {};
    const mechanism = isRecord(value.uploadMechanism)
      ? value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
      : undefined;
    const uploadUrl =
      isRecord(mechanism) && typeof mechanism.uploadUrl === "string" ? mechanism.uploadUrl : "";
    const assetMatch = typeof value.asset === "string" ? ASSET_URN.exec(value.asset) : null;

    if (!uploadUrl || !assetMatch?.[1]) {
      throw this.error("PROVIDER_ERROR", "LinkedIn didn't return an image upload location.", true);
    }
    if (!isLinkedInUrl(uploadUrl)) {
      throw this.error("PROVIDER_ERROR", "LinkedIn returned an unexpected upload location.");
    }

    const uploadHeaders: Record<string, string> = {};
    if (isRecord(mechanism) && isRecord(mechanism.headers)) {
      for (const [name, headerValue] of Object.entries(mechanism.headers)) {
        const lower = name.toLowerCase();
        if (
          typeof headerValue === "string" &&
          lower !== "authorization" &&
          lower !== "content-type"
        ) {
          uploadHeaders[name] = headerValue;
        }
      }
    }
    return { uploadUrl, uploadHeaders, assetId: assetMatch[1] };
  }
}

export const createLinkedInProvider = () =>
  new LinkedInProvider({
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
    redirectUri: env.LINKEDIN_REDIRECT_URI,
    apiVersion: env.LINKEDIN_API_VERSION,
  });
