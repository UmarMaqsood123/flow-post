/**
 * Facebook Pages via the Graph API.
 *
 * One connected account is one Page. Facebook Login returns a short-lived user
 * token; we exchange it for a long-lived one and then read Page tokens from
 * /me/accounts. Page tokens derived from a long-lived user token don't carry an
 * expiry, so there is no refresh: when Meta invalidates one (password change,
 * permissions revoked, app restricted) the user reconnects.
 *
 * Implemented: text, single photo, multi-photo, standard video, Reels.
 * Deliberately not implemented:
 * - Link preview customization. `picture`/`name`/`description`/`caption` on
 *   /feed have been deprecated since v2.10; previews come from the page's own
 *   Open Graph tags and cannot be overridden.
 * - `scheduled_publish_time`. Our own scheduler owns timing, so posts go out
 *   as published; handing the time to Meta as well would mean two schedulers.
 *
 * Permissions: pages_show_list, pages_read_engagement, pages_manage_posts, and
 * the CREATE_CONTENT task on the Page. All three need Advanced Access through
 * App Review, plus Business Verification and Tech Provider Access Verification.
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 */
import { env } from "../../../config/env";
import { SocialCapability } from "../capabilities";
import { SocialProviderError, type SocialProviderErrorKindValue } from "../errors";
import type { FetchLike } from "../http";
import { isRecord } from "../http";
import { count, definedMetrics } from "../metrics";
import { FACEBOOK_DIALOG_HOST, GraphClient, requireString, RUPLOAD_HOST } from "../meta/graph";
import {
  DEFAULT_GRAPH_VERSION,
  FACEBOOK_SCOPES,
  type MetaPage,
  readPages,
  uploadResumableVideo,
} from "../meta/pages";
import { BaseSocialProvider } from "../provider";
import type {
  AnalyticsQuery,
  AnalyticsResult,
  AuthorizationRequest,
  AuthorizationRequestInput,
  ConnectionTarget,
  MediaAsset,
  OAuthCallbackInput,
  OAuthConnection,
  OAuthTokenSet,
  ProviderCredentials,
  ProviderPost,
  PublishImageInput,
  PublishResult,
  PublishTextInput,
  PublishVideoInput,
  SocialProfile,
} from "../types";
import { asBody } from "../http";

/** A Page post can be far longer than this, but nothing sane is. */
const MAX_MESSAGE_LENGTH = 63_206;
/** https://developers.facebook.com/docs/graph-api/reference/page/photos/ */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/tiff"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** /feed accepts at most 10 attached photos. */
const MAX_PHOTOS = 10;
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export interface FacebookProviderConfig {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
  graphVersion?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

export class FacebookProvider extends BaseSocialProvider {
  readonly platform = "FACEBOOK" as const;
  readonly displayName = "Facebook";
  readonly capabilities = new Set<SocialCapability>([
    SocialCapability.TEXT_POST,
    SocialCapability.IMAGE_POST,
    SocialCapability.CAROUSEL,
    SocialCapability.VIDEO_POST,
    SocialCapability.SHORT_VIDEO,
    SocialCapability.READ_POST,
    SocialCapability.DELETE_POST,
    SocialCapability.ANALYTICS,
  ]);
  readonly oauth;

  private readonly graph: GraphClient;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: FacebookProviderConfig = {}) {
    super();
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.oauth = {
      scopes: [...FACEBOOK_SCOPES],
      usesPkce: false,
      redirectUri: config.redirectUri,
    };
    this.graph = new GraphClient(this, {
      version: config.graphVersion ?? DEFAULT_GRAPH_VERSION,
      fetch: this.fetchImpl,
      timeoutMs: config.timeoutMs,
    });
  }

  isAvailable(): boolean {
    return Boolean(this.config.appId && this.config.appSecret && this.config.redirectUri);
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }

  private error(kind: SocialProviderErrorKindValue, message: string) {
    return new SocialProviderError(kind, message, { platform: this.platform });
  }

  private credentials() {
    const { appId, appSecret } = this.config;
    if (!appId || !appSecret) {
      throw this.error("NOT_CONFIGURED", "Facebook isn't configured on this server.");
    }
    return { appId, appSecret };
  }

  /** The Page id and token live in metadata; the account can't publish without them. */
  private page(credentials: ProviderCredentials) {
    const pageId = credentials.providerAccountId;
    if (!pageId) {
      throw this.error("REAUTH_REQUIRED", "This Facebook Page needs reconnecting.");
    }
    // The Page token is the account's stored access token: connectTarget puts it there.
    return { pageId, token: credentials.accessToken };
  }

  // async so a missing-credentials throw arrives as a rejection, like every
  // other provider method.
  async getAuthorizationUrl({
    state,
    redirectUri,
  }: AuthorizationRequestInput): Promise<AuthorizationRequest> {
    const { appId } = this.credentials();
    const url = new URL(`${FACEBOOK_DIALOG_HOST}/${this.graph.version}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.oauth.scopes.join(","));
    return { url: url.toString() };
  }

  /**
   * Exchanges the code for a long-lived user token. The Pages it can manage are
   * read separately by `listConnectionTargets`, because one login usually covers
   * several Pages and the user has to say which one they mean.
   */
  async handleOAuthCallback({ code, redirectUri }: OAuthCallbackInput): Promise<OAuthConnection> {
    const tokens = await this.exchangeCode(code, redirectUri);
    const pages = await this.pages(tokens.accessToken);
    const page = pages[0];
    if (!page) {
      throw this.error(
        "PERMISSION_DENIED",
        "No Facebook Page was shared with FlowPost. Reconnect and choose a Page you manage.",
      );
    }
    return { tokens, profile: this.profileFor(page) };
  }

  /** Every Page the user granted, so they can pick which to connect. */
  async listConnectionTargets(tokens: OAuthTokenSet): Promise<ConnectionTarget[]> {
    const pages = await this.pages(tokens.accessToken);
    return pages.map((page) => ({
      id: page.id,
      name: page.name,
      username: page.username ?? null,
      image: page.picture ?? null,
      description: page.category ?? null,
    }));
  }

  /**
   * Turns the chosen Page into the account we store. The Page access token
   * replaces the user token: it is what every publish call uses, and it doesn't
   * expire while the user token behind it stays valid.
   */
  async connectTarget(tokens: OAuthTokenSet, targetId: string): Promise<OAuthConnection> {
    const pages = await this.pages(tokens.accessToken);
    const page = pages.find((candidate) => candidate.id === targetId);
    if (!page) {
      throw this.error("INVALID_REQUEST", "That Facebook Page is no longer available to connect.");
    }
    return {
      tokens: {
        accessToken: page.accessToken,
        refreshToken: null,
        // Page tokens from a long-lived user token carry no expiry of their own.
        expiresAt: null,
        scopes: tokens.scopes,
      },
      profile: this.profileFor(page),
    };
  }

  private profileFor(page: MetaPage): SocialProfile {
    return {
      providerAccountId: page.id,
      accountName: page.name,
      username: page.username ?? null,
      profileImage: page.picture ?? null,
      metadata: {
        accountType: "page",
        category: page.category ?? null,
        // Present when the Page has an Instagram professional account attached,
        // which is what the Instagram provider connects to.
        instagramAccountId: page.instagramAccountId ?? null,
        tasks: page.tasks,
      },
    };
  }

  private async pages(userAccessToken: string): Promise<MetaPage[]> {
    return readPages(this.graph, userAccessToken);
  }

  private async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const { appId, appSecret } = this.credentials();
    const short = await this.graph.request({
      path: "/oauth/access_token",
      query: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
      context: "token-exchange",
    });
    const shortToken = requireString(this, short, "access_token");

    // Short-lived tokens last an hour, which is no use for a scheduler.
    const long = await this.graph.request({
      path: "/oauth/access_token",
      query: {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      },
      context: "token-exchange",
    });
    const accessToken = requireString(this, long, "access_token");
    const expiresIn =
      isRecord(long) && typeof long.expires_in === "number" ? long.expires_in : null;

    return {
      accessToken,
      refreshToken: null,
      expiresAt: expiresIn ? new Date(this.now().getTime() + expiresIn * 1000) : null,
      scopes: [...this.oauth.scopes],
    };
  }

  async getProfile(credentials: ProviderCredentials): Promise<SocialProfile> {
    const { pageId, token } = this.page(credentials);
    const body = await this.graph.request({
      path: `/${pageId}`,
      query: { fields: "id,name,username,category,picture{url}" },
      accessToken: token,
    });
    const picture =
      isRecord(body) && isRecord(body.picture) && isRecord(body.picture.data)
        ? body.picture.data.url
        : null;
    return {
      providerAccountId: requireString(this, body, "id"),
      accountName: requireString(this, body, "name"),
      username: isRecord(body) && typeof body.username === "string" ? body.username : null,
      profileImage: typeof picture === "string" ? picture : null,
      metadata: {
        accountType: "page",
        category: isRecord(body) && typeof body.category === "string" ? body.category : null,
      },
    };
  }

  private validateMessage(text: string, { required }: { required: boolean }) {
    const trimmed = text.trim();
    if (required && trimmed.length === 0) {
      throw this.error("INVALID_REQUEST", "Write something before posting to Facebook.");
    }
    if ([...trimmed].length > MAX_MESSAGE_LENGTH) {
      throw this.error(
        "INVALID_REQUEST",
        `Facebook posts are limited to ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`,
      );
    }
    return trimmed;
  }

  private postUrl(pageId: string, postId: string) {
    // Meta returns either "{page}_{post}" or a bare id depending on the endpoint.
    const id = postId.includes("_") ? postId : `${pageId}_${postId}`;
    return `https://www.facebook.com/${id.replace("_", "/posts/")}`;
  }

  private result(pageId: string, postId: string): PublishResult {
    return {
      providerPostId: postId,
      url: this.postUrl(pageId, postId),
      publishedAt: this.now(),
    };
  }

  override async publishText(
    credentials: ProviderCredentials,
    { text }: PublishTextInput,
  ): Promise<PublishResult> {
    const { pageId, token } = this.page(credentials);
    const message = this.validateMessage(text, { required: true });
    const body = await this.graph.request({
      path: `/${pageId}/feed`,
      method: "POST",
      form: { message },
      accessToken: token,
    });
    return this.result(pageId, requireString(this, body, "id"));
  }

  private validateImages(images: MediaAsset[]) {
    if (images.length === 0) {
      throw this.error("INVALID_REQUEST", "Add an image to post it to Facebook.");
    }
    if (images.length > MAX_PHOTOS) {
      throw this.error("INVALID_REQUEST", `Facebook posts take up to ${MAX_PHOTOS} photos.`);
    }
    for (const image of images) {
      if (!IMAGE_TYPES.includes(image.mimeType)) {
        throw this.error("INVALID_REQUEST", `Facebook doesn't accept ${image.mimeType} images.`);
      }
      if (image.size !== undefined && image.size > MAX_IMAGE_BYTES) {
        throw this.error("INVALID_REQUEST", "Facebook images have to be 10 MB or smaller.");
      }
    }
  }

  /**
   * One photo posts directly with its caption. Several are uploaded unpublished
   * first, then attached to a single feed post, which is how Meta builds a
   * multi-photo post.
   */
  override async publishImage(
    credentials: ProviderCredentials,
    { text = "", images }: PublishImageInput,
  ): Promise<PublishResult> {
    const { pageId, token } = this.page(credentials);
    this.validateImages(images);
    const message = this.validateMessage(text, { required: false });

    if (images.length === 1) {
      const body = await this.graph.request({
        path: `/${pageId}/photos`,
        method: "POST",
        form: {
          url: images[0].url,
          caption: message || undefined,
          alt_text_custom: images[0].altText,
          published: true,
        },
        accessToken: token,
      });
      // /photos returns the photo id plus the post id it created.
      const postId = isRecord(body) && typeof body.post_id === "string" ? body.post_id : null;
      return this.result(pageId, postId ?? requireString(this, body, "id"));
    }

    const mediaIds: string[] = [];
    for (const image of images) {
      const uploaded = await this.graph.request({
        path: `/${pageId}/photos`,
        method: "POST",
        form: { url: image.url, alt_text_custom: image.altText, published: false },
        accessToken: token,
      });
      mediaIds.push(requireString(this, uploaded, "id"));
    }

    const body = await this.graph.request({
      path: `/${pageId}/feed`,
      method: "POST",
      form: {
        message: message || undefined,
        attached_media: JSON.stringify(mediaIds.map((id) => ({ media_fbid: id }))),
      },
      accessToken: token,
    });
    return this.result(pageId, requireString(this, body, "id"));
  }

  /**
   * Reels and standard video are different APIs. Both upload the file rather
   * than handing Meta a URL, so the media never has to be public.
   */
  override async publishVideo(
    credentials: ProviderCredentials,
    { text = "", title, video, format }: PublishVideoInput,
  ): Promise<PublishResult> {
    const { pageId, token } = this.page(credentials);
    if (!VIDEO_TYPES.includes(video.mimeType)) {
      throw this.error("INVALID_REQUEST", `Facebook doesn't accept ${video.mimeType} video.`);
    }
    const description = this.validateMessage(text, { required: false });

    const videoId =
      format === "short"
        ? await this.publishReel(pageId, token, video, description)
        : await this.publishStandardVideo(pageId, token, video, description, title);
    return this.result(pageId, videoId);
  }

  /** https://developers.facebook.com/docs/video-api/guides/publishing/ */
  private async publishStandardVideo(
    pageId: string,
    token: string,
    video: MediaAsset,
    description: string,
    title?: string,
  ): Promise<string> {
    const { appId } = this.credentials();
    const handle = await uploadResumableVideo({
      graph: this.graph,
      fetchImpl: this.fetchImpl,
      provider: this,
      appId,
      accessToken: token,
      video,
      timeoutMs: this.config.timeoutMs,
    });
    const body = await this.graph.request({
      path: `/${pageId}/videos`,
      method: "POST",
      form: {
        title,
        description: description || undefined,
        fbuploader_video_file_chunk: handle,
      },
      accessToken: token,
    });
    return requireString(this, body, "id");
  }

  /** https://developers.facebook.com/docs/video-api/guides/reels-publishing/ */
  private async publishReel(
    pageId: string,
    token: string,
    video: MediaAsset,
    description: string,
  ): Promise<string> {
    const started = await this.graph.request({
      path: `/${pageId}/video_reels`,
      method: "POST",
      form: { upload_phase: "start" },
      accessToken: token,
    });
    const videoId = requireString(this, started, "video_id");

    const bytes = await this.readMedia(video);
    const response = await this.upload(
      `${RUPLOAD_HOST}/video-upload/${this.graph.version}/${videoId}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          offset: "0",
          file_size: String(bytes.byteLength),
        },
        body: asBody(bytes),
      },
    );
    if (!response.ok) {
      throw this.error("PROVIDER_ERROR", "Facebook wouldn't accept the video upload.");
    }

    await this.graph.request({
      path: `/${pageId}/video_reels`,
      method: "POST",
      form: {
        upload_phase: "finish",
        video_id: videoId,
        video_state: "PUBLISHED",
        description: description || undefined,
      },
      accessToken: token,
    });
    return videoId;
  }

  private async readMedia(asset: MediaAsset): Promise<Buffer> {
    if (!asset.read) {
      throw this.error("INVALID_REQUEST", "That file can't be read for upload.");
    }
    const bytes = await asset.read();
    if (bytes.byteLength === 0) {
      throw this.error("INVALID_REQUEST", "That file is empty.");
    }
    return bytes;
  }

  /** Raw upload to Meta's upload host, outside the Graph JSON envelope. */
  private upload(url: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
    });
  }

  override async getPost(
    credentials: ProviderCredentials,
    providerPostId: string,
  ): Promise<ProviderPost> {
    const { pageId, token } = this.page(credentials);
    const body = await this.graph.request({
      path: `/${providerPostId}`,
      query: { fields: "id,message,created_time,permalink_url" },
      accessToken: token,
    });
    const record = isRecord(body) ? body : {};
    return {
      providerPostId: requireString(this, body, "id"),
      url:
        typeof record.permalink_url === "string"
          ? record.permalink_url
          : this.postUrl(pageId, providerPostId),
      text: typeof record.message === "string" ? record.message : null,
      publishedAt: typeof record.created_time === "string" ? new Date(record.created_time) : null,
    };
  }

  /**
   * Page and post insights.
   *
   * Meta retired impressions: `post_impressions` became `post_media_view` in
   * November 2025, so what used to be reported as impressions is a views metric
   * now and is reported as views. Nothing here substitutes one for the other.
   * https://developers.facebook.com/docs/graph-api/reference/page/insights/
   */
  override async getAnalytics(
    credentials: ProviderCredentials,
    query: AnalyticsQuery,
  ): Promise<AnalyticsResult> {
    const { pageId, token } = this.page(credentials);
    const fetchedAt = this.now();

    if (query.providerPostId) {
      const body = await this.graph.request({
        path: `/${query.providerPostId}/insights`,
        query: {
          metric: [
            "post_media_view",
            "post_total_media_view_unique",
            "post_clicks",
            "post_reactions_by_type_total",
            "post_activity_by_action_type",
          ].join(","),
        },
        accessToken: token,
      });
      const values = readInsights(body);
      const reactions = sumValues(values.post_reactions_by_type_total);
      const activity = isRecord(values.post_activity_by_action_type)
        ? values.post_activity_by_action_type
        : {};
      return {
        metrics: definedMetrics({
          views: count(values.post_media_view),
          reach: count(values.post_total_media_view_unique),
          clicks: count(values.post_clicks),
          likes: reactions,
          comments: count(activity.comment),
          shares: count(activity.share),
        }),
        raw: values,
        periodStart: null,
        periodEnd: null,
        fetchedAt,
      };
    }

    // The follower count is a plain Page field rather than an insight.
    const body = await this.graph.request({
      path: `/${pageId}`,
      query: { fields: "followers_count,fan_count" },
      accessToken: token,
    });
    const record = isRecord(body) ? body : {};
    return {
      metrics: definedMetrics({
        followers: count(record.followers_count) ?? count(record.fan_count),
      }),
      raw: record,
      periodStart: null,
      periodEnd: null,
      fetchedAt,
    };
  }

  override async deletePost(
    credentials: ProviderCredentials,
    providerPostId: string,
  ): Promise<void> {
    const { token } = this.page(credentials);
    await this.graph.request({ path: `/${providerPostId}`, method: "DELETE", accessToken: token });
  }
}

/** Insights come back as `data: [{ name, values: [{ value }] }]`. */
const readInsights = (body: unknown): Record<string, unknown> => {
  const rows = isRecord(body) && Array.isArray(body.data) ? body.data.filter(isRecord) : [];
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name : null;
    if (!name) continue;
    const first = Array.isArray(row.values) ? row.values.find(isRecord) : null;
    values[name] = first?.value;
  }
  return values;
};

/** Reaction and activity metrics arrive as a breakdown keyed by type. */
const sumValues = (value: unknown): number | undefined => {
  if (!isRecord(value)) return count(value);
  const numbers = Object.values(value)
    .map(count)
    .filter((item): item is number => item !== undefined);
  return numbers.length > 0 ? numbers.reduce((total, item) => total + item, 0) : undefined;
};

export const createFacebookProvider = () =>
  new FacebookProvider({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_FACEBOOK_REDIRECT_URI,
    graphVersion: env.META_GRAPH_VERSION,
  });
