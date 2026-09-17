/**
 * TikTok via Login Kit and the Content Posting API (v2).
 *
 * Publishing a video is four steps: ask what the creator is allowed to post,
 * initialise the post, upload the file in chunks, then poll until TikTok says
 * it is live. https://developers.tiktok.com/doc/content-posting-api-get-started
 *
 * Things the platform dictates, which shape this file:
 * - **Unaudited apps can only post privately.** Until the app passes TikTok's
 *   audit, `privacy_level_options` comes back as `SELF_ONLY` only, and asking
 *   for anything else is refused. The privacy level is therefore never
 *   hardcoded: it is read from creator_info at publish time.
 * - **creator_info must be queried before posting.** TikTok requires the
 *   creator's current options to drive the UI, and they can change between
 *   scheduling and publishing.
 * - **No text-only posts and no deleting.** TikTok has neither.
 * - **Photo posts are not implemented.** They can only be sent as
 *   `PULL_FROM_URL`, which needs the media host's URL prefix verified in the
 *   developer portal, so it can't work until that is set up.
 * - **PKCE is not used.** It is required only for mobile and desktop clients,
 *   and TikTok's documented challenge is hex-encoded SHA-256 rather than the
 *   base64url of RFC 7636, so the server-side flow avoids a non-standard path.
 *
 * Scopes: user.info.basic, video.publish. `video.publish` needs approval
 * through app review before direct posting works at all.
 */
import { env } from "../../../config/env";
import { SocialCapability } from "../capabilities";
import { SocialProviderError, type SocialProviderErrorKindValue } from "../errors";
import { type FetchLike, isRecord, providerFetch, readJson, retryAfterSeconds } from "../http";
import { count, definedMetrics } from "../metrics";
import { BaseSocialProvider } from "../provider";
import type {
  AnalyticsQuery,
  AnalyticsResult,
  AuthorizationRequest,
  AuthorizationRequestInput,
  MediaAsset,
  OAuthCallbackInput,
  OAuthConnection,
  OAuthTokenSet,
  ProviderCredentials,
  PublishResult,
  PublishVideoInput,
  SocialProfile,
} from "../types";
import { asBody } from "../http";

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API_HOST = "https://open.tiktokapis.com";

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.publish",
  // Analytics: video.list reads the creator's own videos with their counters,
  // user.info.stats unlocks the follower count. Both need app review.
  "video.list",
  "user.info.stats",
] as const;

/** https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide */
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_CHUNKS = 1000;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_TITLE_LENGTH = 2200;

/** Polling: TikTok processes the upload after we finish sending it. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

/**
 * How TikTok wants a file split. The chunk count is deliberately rounded
 * *down*: the final chunk carries the remainder, so rounding up produces an
 * empty trailing chunk that TikTok rejects.
 */
export const planChunks = (size: number): { chunkSize: number; chunkCount: number } => {
  if (size <= MIN_CHUNK_BYTES) return { chunkSize: size, chunkCount: 1 };
  const chunkSize = Math.min(
    MAX_CHUNK_BYTES,
    Math.max(MIN_CHUNK_BYTES, Math.ceil(size / MAX_CHUNKS)),
  );
  return { chunkSize, chunkCount: Math.floor(size / chunkSize) };
};

export interface TikTokProviderConfig {
  clientKey?: string;
  clientSecret?: string;
  redirectUri?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface CreatorInfo {
  nickname: string;
  username: string;
  privacyLevels: string[];
  maxDurationSeconds: number | null;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

export class TikTokProvider extends BaseSocialProvider {
  readonly platform = "TIKTOK" as const;
  readonly displayName = "TikTok";
  readonly capabilities = new Set<SocialCapability>([
    SocialCapability.VIDEO_POST,
    SocialCapability.SHORT_VIDEO,
    SocialCapability.ANALYTICS,
    SocialCapability.TOKEN_REFRESH,
  ]);
  readonly oauth;

  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: TikTokProviderConfig = {}) {
    super();
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.oauth = {
      scopes: [...TIKTOK_SCOPES],
      // Server-side web clients don't need PKCE, and TikTok's variant is non-standard.
      usesPkce: false,
      redirectUri: config.redirectUri,
    };
  }

  isAvailable(): boolean {
    return Boolean(this.config.clientKey && this.config.clientSecret && this.config.redirectUri);
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }

  private sleep(ms: number): Promise<void> {
    return this.config.sleep
      ? this.config.sleep(ms)
      : new Promise((resolve) => setTimeout(resolve, ms));
  }

  private error(kind: SocialProviderErrorKindValue, message: string, outcomeUnknown = false) {
    return new SocialProviderError(kind, message, {
      platform: this.platform,
      outcomeUnknown,
      // An unknown outcome is never retryable: the post may already be live.
      ...(outcomeUnknown ? { retryable: false } : {}),
    });
  }

  private credentials() {
    const { clientKey, clientSecret } = this.config;
    if (!clientKey || !clientSecret) {
      throw this.error("NOT_CONFIGURED", "TikTok isn't configured on this server.");
    }
    return { clientKey, clientSecret };
  }

  async getAuthorizationUrl({
    state,
    redirectUri,
  }: AuthorizationRequestInput): Promise<AuthorizationRequest> {
    const { clientKey } = this.credentials();
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", this.oauth.scopes.join(","));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  }

  /**
   * TikTok returns its errors with HTTP 200 as often as not, so every response
   * goes through here: the `error` object decides, not the status code.
   */
  private async call(
    path: string,
    init: RequestInit,
    context: "token" | "api",
  ): Promise<Record<string, unknown>> {
    const response = await providerFetch(
      this.fetchImpl,
      this,
      `${API_HOST}${path}`,
      init,
      this.config.timeoutMs,
    );
    const body = await readJson(response);
    const record = isRecord(body) ? body : {};

    const failure = this.readError(record, response, context);
    if (failure) throw failure;
    return record;
  }

  /** TikTok's error envelope: `{ error: { code, message } }`, where code "ok" means success. */
  private readError(
    body: Record<string, unknown>,
    response: Response,
    context: "token" | "api",
  ): SocialProviderError | null {
    const error = isRecord(body.error) ? body.error : null;
    const code = typeof error?.code === "string" ? error.code : null;
    const tokenError = typeof body.error === "string" ? body.error : null;
    if (response.ok && (!code || code === "ok") && !tokenError) return null;

    const description =
      typeof error?.message === "string"
        ? error.message
        : typeof body.error_description === "string"
          ? body.error_description
          : null;
    const detail = description ? description.replace(/\s+/g, " ").slice(0, 200) : null;
    const kind = code ?? tokenError ?? "";

    if (context === "token") {
      // Busy or throttled isn't a revoked login: keep the account connected and retry later.
      if (response.status === 429 || response.status === 408 || kind === "rate_limit_exceeded") {
        return new SocialProviderError("RATE_LIMITED", "TikTok is busy. Try again shortly.", {
          platform: this.platform,
          retryable: true,
        });
      }
      return response.status >= 500
        ? this.error("PROVIDER_ERROR", "TikTok couldn't complete sign-in. Try again.")
        : this.error("REAUTH_REQUIRED", "TikTok sign-in failed. Connect the account again.");
    }
    if (kind === "access_token_invalid" || kind === "access_token_expired") {
      return this.error("TOKEN_EXPIRED", "TikTok access has expired.");
    }
    if (kind === "scope_not_authorized" || kind === "scope_permission_missed") {
      return this.error(
        "PERMISSION_DENIED",
        "This TikTok account hasn't approved posting. Reconnect and allow it.",
      );
    }
    if (kind === "unaudited_client_can_only_post_to_private_accounts") {
      return this.error(
        "PERMISSION_DENIED",
        "TikTok only allows private posts until this app passes TikTok's audit.",
      );
    }
    if (kind === "spam_risk_too_many_posts" || kind === "spam_risk_user_banned_from_posting") {
      return this.error(
        "ACCOUNT_RESTRICTED",
        detail ?? "TikTok has paused posting for this account.",
      );
    }
    if (kind === "rate_limit_exceeded" || response.status === 429) {
      return new SocialProviderError("RATE_LIMITED", "TikTok is rate limiting this account.", {
        platform: this.platform,
        retryAfterSeconds: retryAfterSeconds(response),
      });
    }
    if (kind === "internal_error" || response.status >= 500) {
      return new SocialProviderError("PROVIDER_ERROR", "TikTok is having trouble. Trying again.", {
        platform: this.platform,
        retryable: true,
      });
    }
    return this.error("INVALID_REQUEST", detail ?? "TikTok rejected the request.");
  }

  private json(accessToken: string, body: unknown): RequestInit {
    return {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
    };
  }

  private async requestTokens(form: Record<string, string>): Promise<OAuthTokenSet> {
    const { clientKey, clientSecret } = this.credentials();
    const body = new URLSearchParams({
      ...form,
      client_key: clientKey,
      client_secret: clientSecret,
    });
    const data = await this.call(
      "/v2/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      "token",
    );

    const accessToken = typeof data.access_token === "string" ? data.access_token : null;
    if (!accessToken) {
      throw this.error("PROVIDER_ERROR", "TikTok returned an unexpected sign-in response.");
    }
    const seconds = (value: unknown) => (typeof value === "number" && value > 0 ? value : null);
    const expiresIn = seconds(data.expires_in);
    const refreshExpiresIn = seconds(data.refresh_expires_in);
    const now = this.now().getTime();

    return {
      accessToken,
      // Refresh tokens rotate: the new one must replace the stored one.
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
      expiresAt: expiresIn ? new Date(now + expiresIn * 1000) : null,
      refreshTokenExpiresAt: refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000) : null,
      scopes: typeof data.scope === "string" ? data.scope.split(/[\s,]+/).filter(Boolean) : [],
    };
  }

  async handleOAuthCallback({ code, redirectUri }: OAuthCallbackInput): Promise<OAuthConnection> {
    const tokens = await this.requestTokens({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const profile = await this.fetchProfile(tokens.accessToken);
    return { tokens, profile };
  }

  override refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    return this.requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  getProfile(credentials: ProviderCredentials): Promise<SocialProfile> {
    return this.fetchProfile(credentials.accessToken);
  }

  private async fetchProfile(accessToken: string): Promise<SocialProfile> {
    const fields = "open_id,union_id,avatar_url,display_name,username";
    const data = await this.call(
      `/v2/user/info/?fields=${encodeURIComponent(fields)}`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
      "api",
    );
    const user = isRecord(data.data) && isRecord(data.data.user) ? data.data.user : null;
    const openId = user && typeof user.open_id === "string" ? user.open_id : null;
    if (!openId) {
      throw this.error("PROVIDER_ERROR", "TikTok returned an incomplete profile.");
    }
    const username = typeof user?.username === "string" ? user.username : null;
    return {
      providerAccountId: openId,
      accountName:
        typeof user?.display_name === "string" && user.display_name ? user.display_name : "TikTok",
      username,
      profileImage: typeof user?.avatar_url === "string" ? user.avatar_url : null,
      metadata: { accountType: "creator", username },
    };
  }

  /**
   * Lifetime counters. TikTok's Display API reports four numbers per video and
   * no time dimension at all, so a trend is built from daily snapshots on our
   * side rather than from anything TikTok returns.
   * https://developers.tiktok.com/doc/tiktok-api-v2-video-query
   */
  override async getAnalytics(
    credentials: ProviderCredentials,
    query: AnalyticsQuery,
  ): Promise<AnalyticsResult> {
    const fetchedAt = this.now();

    if (query.providerPostId) {
      const fields = "id,view_count,like_count,comment_count,share_count";
      const body = await this.call(
        `/v2/video/query/?fields=${encodeURIComponent(fields)}`,
        this.json(credentials.accessToken, {
          filters: { video_ids: [query.providerPostId] },
        }),
        "api",
      );
      const videos =
        isRecord(body.data) && Array.isArray(body.data.videos)
          ? body.data.videos.filter(isRecord)
          : [];
      const video = videos[0] ?? {};
      return {
        metrics: definedMetrics({
          views: count(video.view_count),
          likes: count(video.like_count),
          comments: count(video.comment_count),
          shares: count(video.share_count),
        }),
        raw: video,
        periodStart: null,
        periodEnd: null,
        fetchedAt,
      };
    }

    const fields = "follower_count,likes_count,video_count";
    const body = await this.call(
      `/v2/user/info/?fields=${encodeURIComponent(fields)}`,
      { method: "GET", headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      "api",
    );
    const user = isRecord(body.data) && isRecord(body.data.user) ? body.data.user : {};
    return {
      metrics: definedMetrics({ followers: count(user.follower_count) }),
      raw: user,
      periodStart: null,
      periodEnd: null,
      fetchedAt,
    };
  }

  /**
   * What this creator may post right now. TikTok requires this before every
   * post, and the answer changes: a private account, or an unaudited app, gets
   * far fewer privacy options.
   * https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
   */
  async queryCreatorInfo(credentials: ProviderCredentials): Promise<CreatorInfo> {
    const data = await this.call(
      "/v2/post/publish/creator_info/query/",
      this.json(credentials.accessToken, {}),
      "api",
    );
    const info = isRecord(data.data) ? data.data : {};
    const levels = Array.isArray(info.privacy_level_options)
      ? info.privacy_level_options.filter((level): level is string => typeof level === "string")
      : [];
    return {
      nickname: typeof info.creator_nickname === "string" ? info.creator_nickname : "",
      username: typeof info.creator_username === "string" ? info.creator_username : "",
      privacyLevels: levels,
      maxDurationSeconds:
        typeof info.max_video_post_duration_sec === "number"
          ? info.max_video_post_duration_sec
          : null,
      commentDisabled: info.comment_disabled === true,
      duetDisabled: info.duet_disabled === true,
      stitchDisabled: info.stitch_disabled === true,
    };
  }

  private validateVideo(video: MediaAsset) {
    if (!VIDEO_TYPES.includes(video.mimeType)) {
      throw this.error("INVALID_REQUEST", `TikTok doesn't accept ${video.mimeType} video.`);
    }
    if (video.size !== undefined && video.size > MAX_VIDEO_BYTES) {
      throw this.error("INVALID_REQUEST", "TikTok videos have to be 4 GB or smaller.");
    }
    if (!video.read) {
      throw this.error("INVALID_REQUEST", "That video can't be read for upload.");
    }
  }

  /**
   * Publishes a video. `format` makes no difference: every TikTok video is
   * short-form, so "standard" and "short" take the same path.
   */
  override async publishVideo(
    credentials: ProviderCredentials,
    { text = "", title, video }: PublishVideoInput,
  ): Promise<PublishResult> {
    this.validateVideo(video);
    const caption = (title ?? text).trim();
    if ([...caption].length > MAX_TITLE_LENGTH) {
      throw this.error(
        "INVALID_REQUEST",
        `TikTok captions are limited to ${MAX_TITLE_LENGTH.toLocaleString("en-US")} characters.`,
      );
    }

    // Ask first: the privacy level has to be one TikTok currently allows.
    const creator = await this.queryCreatorInfo(credentials);
    const privacyLevel = this.choosePrivacyLevel(credentials, creator);

    const bytes = await video.read!();
    if (bytes.byteLength === 0) {
      throw this.error("INVALID_REQUEST", "That video file is empty.");
    }
    const { chunkSize, chunkCount } = planChunks(bytes.byteLength);

    const init = await this.call(
      "/v2/post/publish/video/init/",
      this.json(credentials.accessToken, {
        post_info: {
          title: caption,
          privacy_level: privacyLevel,
          disable_comment: creator.commentDisabled,
          disable_duet: creator.duetDisabled,
          disable_stitch: creator.stitchDisabled,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: bytes.byteLength,
          chunk_size: chunkSize,
          total_chunk_count: chunkCount,
        },
      }),
      "api",
    );
    const data = isRecord(init.data) ? init.data : {};
    const publishId = typeof data.publish_id === "string" ? data.publish_id : null;
    const uploadUrl = typeof data.upload_url === "string" ? data.upload_url : null;
    if (!publishId || !uploadUrl) {
      throw this.error("PROVIDER_ERROR", "TikTok didn't return an upload for this post.");
    }

    await this.uploadChunks(uploadUrl, bytes, chunkSize, chunkCount, video.mimeType);
    return this.awaitPublish(credentials, publishId, creator.username);
  }

  /**
   * The stored privacy level, when the account still offers it. An unaudited
   * app only ever gets SELF_ONLY, so the post goes out private rather than
   * failing: the user is told why through the account's capabilities.
   */
  private choosePrivacyLevel(credentials: ProviderCredentials, creator: CreatorInfo): string {
    const preferred =
      typeof credentials.metadata.privacyLevel === "string"
        ? credentials.metadata.privacyLevel
        : null;
    if (preferred && creator.privacyLevels.includes(preferred)) return preferred;
    if (creator.privacyLevels.includes("PUBLIC_TO_EVERYONE")) return "PUBLIC_TO_EVERYONE";
    const fallback = creator.privacyLevels[0];
    if (!fallback) {
      throw this.error(
        "PERMISSION_DENIED",
        "TikTok isn't allowing this account to post right now.",
      );
    }
    return fallback;
  }

  /** Sequential PUTs. Content-Range is inclusive and counts against the whole file. */
  private async uploadChunks(
    uploadUrl: string,
    bytes: Buffer,
    chunkSize: number,
    chunkCount: number,
    mimeType: string,
  ): Promise<void> {
    const total = bytes.byteLength;
    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * chunkSize;
      // The last chunk takes everything left over.
      const end = index === chunkCount - 1 ? total - 1 : start + chunkSize - 1;
      const response = await providerFetch(
        this.fetchImpl,
        this,
        uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${total}`,
          },
          body: asBody(bytes.subarray(start, end + 1)),
        },
        this.config.timeoutMs ?? 120_000,
      );
      if (!response.ok) {
        throw new SocialProviderError(
          "PROVIDER_ERROR",
          "TikTok wouldn't accept the video upload.",
          {
            platform: this.platform,
            retryable: true,
          },
        );
      }
    }
  }

  /**
   * Waits for TikTok to finish. A timeout here is reported as an unknown
   * outcome: the upload is already with TikTok and may still publish, so the
   * scheduler must not simply try again.
   */
  private async awaitPublish(
    credentials: ProviderCredentials,
    publishId: string,
    username: string,
  ): Promise<PublishResult> {
    const deadline = this.now().getTime() + POLL_TIMEOUT_MS;
    for (;;) {
      const body = await this.call(
        "/v2/post/publish/status/fetch/",
        this.json(credentials.accessToken, { publish_id: publishId }),
        "api",
      );
      const data = isRecord(body.data) ? body.data : {};
      const status = typeof data.status === "string" ? data.status : "";

      if (status === "PUBLISH_COMPLETE") {
        // Note TikTok's own spelling of the field.
        const ids = Array.isArray(data.publicaly_available_post_id)
          ? data.publicaly_available_post_id
          : [];
        const postId = ids.find((id): id is string => typeof id === "string") ?? null;
        return {
          // A private post gets no public id, so the publish id identifies it.
          providerPostId: postId ?? publishId,
          url: postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : null,
          publishedAt: this.now(),
        };
      }
      if (status === "FAILED") {
        const reason = typeof data.fail_reason === "string" ? data.fail_reason : null;
        throw this.error("INVALID_REQUEST", reason ?? "TikTok couldn't publish the video.");
      }
      if (this.now().getTime() >= deadline) {
        throw this.error(
          "PROVIDER_ERROR",
          "TikTok is still processing the video. Check the account before trying again.",
          true,
        );
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
  }
}

export const createTikTokProvider = () =>
  new TikTokProvider({
    clientKey: env.TIKTOK_CLIENT_KEY,
    clientSecret: env.TIKTOK_CLIENT_SECRET,
    redirectUri: env.TIKTOK_REDIRECT_URI,
  });
