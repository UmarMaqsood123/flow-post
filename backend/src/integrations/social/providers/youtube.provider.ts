/**
 * YouTube via Google OAuth and the YouTube Data API v3.
 *
 * One connected account is one channel. Uploading is a resumable upload:
 * initialise a session with the video metadata, then send the bytes.
 * https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 *
 * Things the platform dictates, which shape this file:
 * - **Uploads from an unaudited project are locked private.** Videos inserted
 *   by an API project that hasn't passed YouTube's compliance audit are forced
 *   to private and cannot be made public by anyone, including the channel owner
 *   in Studio. The provider reports the privacy YouTube actually returned
 *   rather than the one we asked for, so this shows up as fact, not a surprise.
 * - **There is no Shorts API.** A video becomes a Short from its own shape:
 *   square or vertical, three minutes or less. Nothing in the response confirms
 *   it, so the constraints are checked before uploading.
 * - **`publishAt` is not used.** YouTube can schedule its own publishing, but
 *   our scheduler already owns timing; using both would mean two schedulers
 *   disagreeing about when a post goes out.
 * - **One grant per channel.** A Google account can own several channels, and
 *   the token is bound to the one chosen at the consent screen, so accounts are
 *   keyed on the channel id.
 *
 * Scopes: youtube.upload (insert) and youtube.readonly (read the channel).
 * Both are sensitive scopes, so Google OAuth verification is required before
 * more than 100 users can connect — separate from YouTube's own audit.
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
  ProviderPost,
  PublishResult,
  PublishVideoInput,
  SocialProfile,
} from "../types";
import { asBody } from "../http";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://www.googleapis.com/youtube/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  // Also covers the statistics used for analytics; no extra scope needed.
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

/** https://developers.google.com/youtube/v3/docs/videos */
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_BYTES = 5000;
const MAX_TAGS_LENGTH = 500;
const MAX_VIDEO_BYTES = 256 * 1024 * 1024 * 1024;
/** Videos up to three minutes, square or taller, are treated as Shorts. */
const SHORTS_MAX_SECONDS = 180;
/** "People & Blogs": a safe default when the caller doesn't choose. */
const DEFAULT_CATEGORY_ID = "22";

export interface YouTubeProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

export class YouTubeProvider extends BaseSocialProvider {
  readonly platform = "YOUTUBE" as const;
  readonly displayName = "YouTube";
  readonly capabilities = new Set<SocialCapability>([
    SocialCapability.VIDEO_POST,
    SocialCapability.SHORT_VIDEO,
    SocialCapability.READ_POST,
    SocialCapability.ANALYTICS,
    SocialCapability.TOKEN_REFRESH,
  ]);
  readonly oauth;

  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: YouTubeProviderConfig = {}) {
    super();
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.oauth = {
      scopes: [...YOUTUBE_SCOPES],
      // Google documents PKCE for public clients; this is a confidential one.
      usesPkce: false,
      redirectUri: config.redirectUri,
    };
  }

  isAvailable(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }

  private error(kind: SocialProviderErrorKindValue, message: string, outcomeUnknown = false) {
    return new SocialProviderError(kind, message, {
      platform: this.platform,
      outcomeUnknown,
      // An unknown outcome is never retryable: the video may already be up.
      ...(outcomeUnknown ? { retryable: false } : {}),
    });
  }

  private credentials() {
    const { clientId, clientSecret } = this.config;
    if (!clientId || !clientSecret) {
      throw this.error("NOT_CONFIGURED", "YouTube isn't configured on this server.");
    }
    return { clientId, clientSecret };
  }

  /**
   * `access_type=offline` with `prompt=consent` is what makes Google return a
   * refresh token: without the prompt it only issues one on the very first
   * grant, so a reconnect would leave us unable to refresh.
   */
  async getAuthorizationUrl({
    state,
    redirectUri,
  }: AuthorizationRequestInput): Promise<AuthorizationRequest> {
    const { clientId } = this.credentials();
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.oauth.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    return { url: url.toString() };
  }

  private async send(
    url: string,
    init: RequestInit,
    context: "token" | "api",
  ): Promise<{ response: Response; body: unknown }> {
    const response = await providerFetch(
      this.fetchImpl,
      this,
      url,
      init,
      this.config.timeoutMs ?? 120_000,
    );
    const body = await readJson(response);
    if (!response.ok) throw this.toProviderError(response, body, context);
    return { response, body };
  }

  /** Google returns `{ error: { code, message, errors: [{ reason }] } }`. */
  private toProviderError(
    response: Response,
    body: unknown,
    context: "token" | "api",
  ): SocialProviderError {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const reasons = Array.isArray(error?.errors)
      ? error.errors.filter(isRecord).map((item) => String(item.reason ?? ""))
      : [];
    const message = typeof error?.message === "string" ? error.message : null;
    const detail = message ? message.replace(/\s+/g, " ").slice(0, 200) : null;

    if (context === "token") {
      // Busy or throttled isn't a revoked login: keep the account connected and retry later.
      if (response.status === 429 || response.status === 408) {
        return new SocialProviderError("RATE_LIMITED", "Google is busy. Try again shortly.", {
          platform: this.platform,
          retryable: true,
        });
      }
      return response.status >= 500
        ? new SocialProviderError(
            "PROVIDER_ERROR",
            "Google couldn't complete sign-in. Try again.",
            {
              platform: this.platform,
              retryable: true,
            },
          )
        : this.error("REAUTH_REQUIRED", "Google sign-in failed. Connect the channel again.");
    }
    if (response.status === 401) {
      return this.error("TOKEN_EXPIRED", "YouTube access has expired.");
    }
    if (reasons.includes("quotaExceeded") || reasons.includes("uploadLimitExceeded")) {
      return new SocialProviderError(
        "RATE_LIMITED",
        "This channel has reached YouTube's daily upload limit. Try again tomorrow.",
        { platform: this.platform, retryAfterSeconds: retryAfterSeconds(response) },
      );
    }
    if (response.status === 429 || reasons.includes("rateLimitExceeded")) {
      return new SocialProviderError("RATE_LIMITED", "YouTube is rate limiting this channel.", {
        platform: this.platform,
        retryAfterSeconds: retryAfterSeconds(response),
      });
    }
    if (reasons.includes("forbidden") || response.status === 403) {
      return this.error(
        "PERMISSION_DENIED",
        detail ?? "YouTube refused this upload for that channel.",
      );
    }
    if (response.status >= 500) {
      return new SocialProviderError("PROVIDER_ERROR", "YouTube is having trouble. Trying again.", {
        platform: this.platform,
        retryable: true,
      });
    }
    return this.error("INVALID_REQUEST", detail ?? "YouTube rejected the request.");
  }

  private async requestTokens(form: Record<string, string>): Promise<OAuthTokenSet> {
    const { clientId, clientSecret } = this.credentials();
    const { body } = await this.send(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...form,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      },
      "token",
    );

    const data = isRecord(body) ? body : {};
    const accessToken = typeof data.access_token === "string" ? data.access_token : null;
    if (!accessToken) {
      throw this.error("PROVIDER_ERROR", "Google returned an unexpected sign-in response.");
    }
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;
    return {
      accessToken,
      // Google only returns a refresh token on the grant, not on refreshes.
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
      expiresAt: expiresIn ? new Date(this.now().getTime() + expiresIn * 1000) : null,
      scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
    };
  }

  async handleOAuthCallback({ code, redirectUri }: OAuthCallbackInput): Promise<OAuthConnection> {
    const tokens = await this.requestTokens({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    if (!tokens.refreshToken) {
      throw this.error(
        "REAUTH_REQUIRED",
        "Google didn't return long-lived access. Disconnect FlowPost in your Google account settings, then connect again.",
      );
    }
    return { tokens, profile: await this.fetchChannel(tokens.accessToken) };
  }

  override refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    return this.requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  getProfile(credentials: ProviderCredentials): Promise<SocialProfile> {
    return this.fetchChannel(credentials.accessToken);
  }

  /**
   * The channel this grant is bound to. `mine=true` returns the channel the
   * user picked at the consent screen, not every channel they own.
   * https://developers.google.com/youtube/v3/docs/channels/list
   */
  private async fetchChannel(accessToken: string): Promise<SocialProfile> {
    const url = `${API_URL}/channels?part=snippet%2CcontentDetails&mine=true`;
    const { body } = await this.send(
      url,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
      "api",
    );
    const items = isRecord(body) && Array.isArray(body.items) ? body.items.filter(isRecord) : [];
    const channel = items[0];
    const id = channel && typeof channel.id === "string" ? channel.id : null;
    if (!id) {
      throw this.error(
        "PERMISSION_DENIED",
        "That Google account has no YouTube channel. Create one, then connect again.",
      );
    }
    const snippet = isRecord(channel.snippet) ? channel.snippet : {};
    const thumbnails = isRecord(snippet.thumbnails) ? snippet.thumbnails : {};
    const thumbnail = isRecord(thumbnails.default) ? thumbnails.default : {};
    const uploads =
      isRecord(channel.contentDetails) && isRecord(channel.contentDetails.relatedPlaylists)
        ? channel.contentDetails.relatedPlaylists.uploads
        : null;

    return {
      providerAccountId: id,
      accountName: typeof snippet.title === "string" ? snippet.title : "YouTube channel",
      username: typeof snippet.customUrl === "string" ? snippet.customUrl : null,
      profileImage: typeof thumbnail.url === "string" ? thumbnail.url : null,
      metadata: {
        accountType: "channel",
        uploadsPlaylistId: typeof uploads === "string" ? uploads : null,
      },
    };
  }

  private validate(video: MediaAsset, title: string, description: string, format: string) {
    if (!video.mimeType.startsWith("video/")) {
      throw this.error("INVALID_REQUEST", `YouTube doesn't accept ${video.mimeType} uploads.`);
    }
    if (video.size !== undefined && video.size > MAX_VIDEO_BYTES) {
      throw this.error("INVALID_REQUEST", "YouTube videos have to be 256 GB or smaller.");
    }
    if (!video.read) {
      throw this.error("INVALID_REQUEST", "That video can't be read for upload.");
    }
    if (title.length === 0) {
      throw this.error("INVALID_REQUEST", "Give the video a title before uploading it.");
    }
    if ([...title].length > MAX_TITLE_LENGTH) {
      throw this.error(
        "INVALID_REQUEST",
        `YouTube titles are limited to ${MAX_TITLE_LENGTH} characters.`,
      );
    }
    if (/[<>]/.test(title) || /[<>]/.test(description)) {
      throw this.error(
        "INVALID_REQUEST",
        "YouTube doesn't allow < or > in the title or description.",
      );
    }
    if (Buffer.byteLength(description, "utf8") > MAX_DESCRIPTION_BYTES) {
      throw this.error("INVALID_REQUEST", "YouTube descriptions are limited to 5,000 bytes.");
    }
    // Nothing in the API says whether a video became a Short, so the shape is
    // checked here instead of letting it silently upload as a normal video.
    if (format === "short") {
      const { durationSeconds, width, height } = video;
      if (durationSeconds !== undefined && durationSeconds > SHORTS_MAX_SECONDS) {
        throw this.error(
          "INVALID_REQUEST",
          "A Short has to be three minutes or less. Upload it as a normal video instead.",
        );
      }
      if (width !== undefined && height !== undefined && width > height) {
        throw this.error(
          "INVALID_REQUEST",
          "A Short has to be square or vertical. Upload it as a normal video instead.",
        );
      }
    }
  }

  private tagsWithinLimit(tags: string[]): string[] {
    const kept: string[] = [];
    let total = 0;
    for (const tag of tags) {
      // A tag containing spaces is counted as if it were quoted.
      const cost = tag.length + (tag.includes(" ") ? 2 : 0);
      if (total + cost > MAX_TAGS_LENGTH) break;
      kept.push(tag);
      total += cost;
    }
    return kept;
  }

  override async publishVideo(
    credentials: ProviderCredentials,
    { text = "", title, video, format }: PublishVideoInput,
  ): Promise<PublishResult> {
    const description = text.trim();
    // A title the caller gave is theirs, so too long is an error. One derived
    // from the post's first line is ours, so it's trimmed to fit instead.
    const videoTitle =
      title?.trim() ??
      [...(description.split("\n")[0] ?? "").trim()].slice(0, MAX_TITLE_LENGTH).join("");
    this.validate(video, videoTitle, description, format);

    const tags = Array.isArray(credentials.metadata.tags)
      ? this.tagsWithinLimit(
          credentials.metadata.tags.filter((tag): tag is string => typeof tag === "string"),
        )
      : [];
    const privacyStatus =
      typeof credentials.metadata.privacyStatus === "string"
        ? credentials.metadata.privacyStatus
        : "public";

    const bytes = await video.read!();
    if (bytes.byteLength === 0) {
      throw this.error("INVALID_REQUEST", "That video file is empty.");
    }

    const sessionUrl = await this.startUpload(
      credentials.accessToken,
      bytes.byteLength,
      video.mimeType,
      {
        snippet: {
          title: videoTitle,
          description,
          tags,
          categoryId:
            typeof credentials.metadata.categoryId === "string"
              ? credentials.metadata.categoryId
              : DEFAULT_CATEGORY_ID,
        },
        status: {
          privacyStatus,
          // Required by YouTube; the caller says whether it's made for kids.
          selfDeclaredMadeForKids: credentials.metadata.madeForKids === true,
        },
      },
    );

    return this.uploadBytes(sessionUrl, bytes, video.mimeType);
  }

  /** Opens a resumable session and returns the URL the bytes go to. */
  private async startUpload(
    accessToken: string,
    size: number,
    mimeType: string,
    resource: unknown,
  ): Promise<string> {
    const { response } = await this.send(
      `${UPLOAD_URL}?uploadType=resumable&part=snippet%2Cstatus`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(size),
          "X-Upload-Content-Type": mimeType,
        },
        body: JSON.stringify(resource),
      },
      "api",
    );
    const location = response.headers.get("location");
    if (!location) {
      throw this.error("PROVIDER_ERROR", "YouTube didn't start the upload.");
    }
    return location;
  }

  /**
   * Sends the file. A failure here may still have created the video, so the
   * outcome is reported as unknown rather than letting the scheduler retry and
   * upload the same video twice.
   */
  private async uploadBytes(
    sessionUrl: string,
    bytes: Buffer,
    mimeType: string,
  ): Promise<PublishResult> {
    const response = await providerFetch(
      this.fetchImpl,
      this,
      sessionUrl,
      {
        method: "PUT",
        headers: { "Content-Type": mimeType, "Content-Length": String(bytes.byteLength) },
        body: asBody(bytes),
      },
      this.config.timeoutMs ?? 600_000,
    );
    const body = await readJson(response);
    if (!response.ok) {
      const failure = this.toProviderError(response, body, "api");
      throw new SocialProviderError(failure.kind, failure.message, {
        platform: this.platform,
        retryable: false,
        outcomeUnknown: true,
        cause: failure,
      });
    }

    const data = isRecord(body) ? body : {};
    const id = typeof data.id === "string" ? data.id : null;
    if (!id) {
      throw this.error("PROVIDER_ERROR", "YouTube didn't return the uploaded video.", true);
    }
    return {
      providerPostId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      publishedAt: this.now(),
    };
  }

  /**
   * Lifetime counters from the Data API. YouTube's own "impressions" is a
   * Studio-only figure with no public endpoint, so it isn't reported here.
   * `favoriteCount` is deprecated and always zero, so it's ignored.
   */
  override async getAnalytics(
    credentials: ProviderCredentials,
    query: AnalyticsQuery,
  ): Promise<AnalyticsResult> {
    const fetchedAt = this.now();
    if (query.providerPostId) {
      const { body } = await this.send(
        `${API_URL}/videos?part=statistics&id=${encodeURIComponent(query.providerPostId)}`,
        { method: "GET", headers: { Authorization: `Bearer ${credentials.accessToken}` } },
        "api",
      );
      const stats = this.statisticsOf(body);
      return {
        metrics: definedMetrics({
          views: count(stats.viewCount),
          likes: count(stats.likeCount),
          comments: count(stats.commentCount),
        }),
        raw: stats,
        periodStart: null,
        periodEnd: null,
        fetchedAt,
      };
    }

    const { body } = await this.send(
      `${API_URL}/channels?part=statistics&mine=true`,
      { method: "GET", headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      "api",
    );
    const stats = this.statisticsOf(body);
    return {
      // Subscriber counts over 1,000 are rounded to three significant figures by
      // YouTube, so this is the channel's own published figure, not an exact one.
      metrics: definedMetrics({
        followers: count(stats.subscriberCount),
        views: count(stats.viewCount),
      }),
      raw: stats,
      periodStart: null,
      periodEnd: null,
      fetchedAt,
    };
  }

  private statisticsOf(body: unknown): Record<string, unknown> {
    const items = isRecord(body) && Array.isArray(body.items) ? body.items.filter(isRecord) : [];
    const first = items[0];
    return first && isRecord(first.statistics) ? first.statistics : {};
  }

  override async getPost(
    credentials: ProviderCredentials,
    providerPostId: string,
  ): Promise<ProviderPost> {
    const { body } = await this.send(
      `${API_URL}/videos?part=snippet%2Cstatus&id=${encodeURIComponent(providerPostId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      "api",
    );
    const items = isRecord(body) && Array.isArray(body.items) ? body.items.filter(isRecord) : [];
    const video = items[0];
    if (!video || typeof video.id !== "string") {
      throw this.error("INVALID_REQUEST", "That video isn't on this channel any more.");
    }
    const snippet = isRecord(video.snippet) ? video.snippet : {};
    return {
      providerPostId: video.id,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      text: typeof snippet.description === "string" ? snippet.description : null,
      publishedAt: typeof snippet.publishedAt === "string" ? new Date(snippet.publishedAt) : null,
    };
  }
}

export const createYouTubeProvider = () =>
  new YouTubeProvider({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
