/**
 * Instagram professional accounts via the Instagram Graph API, using Facebook
 * Login (the account must be linked to a Facebook Page). One connected account
 * is one Instagram professional account.
 *
 * Publishing is always two or three steps: create a container, wait for Meta to
 * finish fetching the media, then publish the container.
 * https://developers.facebook.com/docs/instagram-platform/content-publishing
 *
 * Things the platform does not allow, which shape this file:
 * - **No text-only posts.** Every post needs media, so TEXT_POST is not
 *   declared. That also means the current scheduler can't queue Instagram posts:
 *   it publishes text only.
 * - **Media must be at a public HTTPS URL.** Meta fetches it themselves ("we
 *   cURL your image"), so there is no binary upload for images or carousels.
 * - **No server-side scheduling.** Unlike Facebook there is no
 *   scheduled_publish_time, and containers expire after 24 hours, so a container
 *   is only ever created at publish time.
 * - **No deleting.** The API cannot delete published media, so DELETE_POST is
 *   not declared.
 *
 * Permissions: instagram_basic, instagram_content_publish, pages_show_list,
 * pages_read_engagement — all requiring Advanced Access via App Review, plus
 * Business Verification and Tech Provider Access Verification.
 */
import { env } from "../../../config/env";
import { SocialCapability } from "../capabilities";
import { SocialProviderError, type SocialProviderErrorKindValue } from "../errors";
import { type FetchLike, isRecord } from "../http";
import { FACEBOOK_DIALOG_HOST, GraphClient, requireString } from "../meta/graph";
import { count, definedMetrics } from "../metrics";
import { DEFAULT_GRAPH_VERSION, INSTAGRAM_SCOPES, type MetaPage, readPages } from "../meta/pages";
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
  PublishVideoInput,
  SocialProfile,
} from "../types";

/** https://developers.facebook.com/docs/instagram-platform/content-publishing */
const MAX_CAPTION_LENGTH = 2200;
const MAX_HASHTAGS = 30;
const MAX_CAROUSEL_ITEMS = 10;
/** Instagram only accepts JPEG for image containers. */
const IMAGE_TYPES = ["image/jpeg"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

/** Meta's own advice: poll about once a second, and give up after a few minutes. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export interface InstagramProviderConfig {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
  graphVersion?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
  /** Injected so tests don't actually wait between status polls. */
  sleep?: (ms: number) => Promise<void>;
}

export class InstagramProvider extends BaseSocialProvider {
  readonly platform = "INSTAGRAM" as const;
  readonly displayName = "Instagram";
  readonly capabilities = new Set<SocialCapability>([
    SocialCapability.IMAGE_POST,
    SocialCapability.CAROUSEL,
    SocialCapability.VIDEO_POST,
    SocialCapability.SHORT_VIDEO,
    SocialCapability.READ_POST,
    SocialCapability.ANALYTICS,
  ]);
  readonly oauth;

  private readonly graph: GraphClient;

  constructor(private readonly config: InstagramProviderConfig = {}) {
    super();
    this.oauth = {
      scopes: [...INSTAGRAM_SCOPES],
      usesPkce: false,
      redirectUri: config.redirectUri,
    };
    this.graph = new GraphClient(this, {
      version: config.graphVersion ?? DEFAULT_GRAPH_VERSION,
      fetch: config.fetch ?? ((url, init) => fetch(url, init)),
      timeoutMs: config.timeoutMs,
    });
  }

  isAvailable(): boolean {
    return Boolean(this.config.appId && this.config.appSecret && this.config.redirectUri);
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }

  private sleep(ms: number): Promise<void> {
    return this.config.sleep
      ? this.config.sleep(ms)
      : new Promise((resolve) => setTimeout(resolve, ms));
  }

  private error(kind: SocialProviderErrorKindValue, message: string) {
    return new SocialProviderError(kind, message, { platform: this.platform });
  }

  private credentials() {
    const { appId, appSecret } = this.config;
    if (!appId || !appSecret) {
      throw this.error("NOT_CONFIGURED", "Instagram isn't configured on this server.");
    }
    return { appId, appSecret };
  }

  private account(credentials: ProviderCredentials) {
    const igUserId = credentials.providerAccountId;
    if (!igUserId) {
      throw this.error("REAUTH_REQUIRED", "This Instagram account needs reconnecting.");
    }
    return { igUserId, token: credentials.accessToken };
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

  async handleOAuthCallback({ code, redirectUri }: OAuthCallbackInput): Promise<OAuthConnection> {
    const tokens = await this.exchangeCode(code, redirectUri);
    const linked = await this.linkedAccounts(tokens.accessToken);
    const first = linked[0];
    if (!first) {
      throw this.error(
        "PERMISSION_DENIED",
        "No Instagram professional account was found. Link one to a Facebook Page you manage, then reconnect.",
      );
    }
    return { tokens, profile: this.profileFor(first) };
  }

  /** Each Page with a linked Instagram professional account is one candidate. */
  async listConnectionTargets(tokens: OAuthTokenSet): Promise<ConnectionTarget[]> {
    const linked = await this.linkedAccounts(tokens.accessToken);
    return linked.map((page) => ({
      id: page.instagramAccountId as string,
      name: page.instagramName ?? page.instagramUsername ?? page.name,
      username: page.instagramUsername,
      image: page.instagramPicture,
      description: `Linked to ${page.name}`,
    }));
  }

  async connectTarget(tokens: OAuthTokenSet, targetId: string): Promise<OAuthConnection> {
    const linked = await this.linkedAccounts(tokens.accessToken);
    const page = linked.find((candidate) => candidate.instagramAccountId === targetId);
    if (!page) {
      throw this.error(
        "INVALID_REQUEST",
        "That Instagram account is no longer available to connect.",
      );
    }
    return {
      // Publishing uses the Page token the Instagram account hangs off.
      tokens: {
        accessToken: page.accessToken,
        refreshToken: null,
        expiresAt: null,
        scopes: tokens.scopes,
      },
      profile: this.profileFor(page),
    };
  }

  private profileFor(page: MetaPage): SocialProfile {
    return {
      providerAccountId: page.instagramAccountId as string,
      accountName: page.instagramName ?? page.instagramUsername ?? page.name,
      username: page.instagramUsername,
      profileImage: page.instagramPicture,
      metadata: {
        accountType: "professional",
        pageId: page.id,
        pageName: page.name,
      },
    };
  }

  private async linkedAccounts(userAccessToken: string): Promise<MetaPage[]> {
    const pages = await readPages(this.graph, userAccessToken);
    return pages.filter((page) => page.instagramAccountId);
  }

  private async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const { appId, appSecret } = this.credentials();
    const short = await this.graph.request({
      path: "/oauth/access_token",
      query: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
      context: "token-exchange",
    });
    const long = await this.graph.request({
      path: "/oauth/access_token",
      query: {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: requireString(this, short, "access_token"),
      },
      context: "token-exchange",
    });
    const expiresIn =
      isRecord(long) && typeof long.expires_in === "number" ? long.expires_in : null;
    return {
      accessToken: requireString(this, long, "access_token"),
      refreshToken: null,
      expiresAt: expiresIn ? new Date(this.now().getTime() + expiresIn * 1000) : null,
      scopes: [...this.oauth.scopes],
    };
  }

  async getProfile(credentials: ProviderCredentials): Promise<SocialProfile> {
    const { igUserId, token } = this.account(credentials);
    const body = await this.graph.request({
      path: `/${igUserId}`,
      query: { fields: "id,username,name,profile_picture_url" },
      accessToken: token,
    });
    const record = isRecord(body) ? body : {};
    const username = typeof record.username === "string" ? record.username : null;
    return {
      providerAccountId: requireString(this, body, "id"),
      accountName: typeof record.name === "string" ? record.name : (username ?? "Instagram"),
      username,
      profileImage:
        typeof record.profile_picture_url === "string" ? record.profile_picture_url : null,
      metadata: { accountType: "professional", ...credentials.metadata },
    };
  }

  private validateCaption(text: string): string {
    const caption = text.trim();
    if ([...caption].length > MAX_CAPTION_LENGTH) {
      throw this.error(
        "INVALID_REQUEST",
        `Instagram captions are limited to ${MAX_CAPTION_LENGTH.toLocaleString("en-US")} characters.`,
      );
    }
    const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
    if (hashtags > MAX_HASHTAGS) {
      throw this.error("INVALID_REQUEST", `Instagram allows up to ${MAX_HASHTAGS} hashtags.`);
    }
    return caption;
  }

  /** Meta fetches the file itself, so it has to be reachable over public HTTPS. */
  private validatePublicUrl(asset: MediaAsset) {
    let url: URL;
    try {
      url = new URL(asset.url);
    } catch {
      throw this.error("INVALID_REQUEST", "Instagram needs a public link to the file.");
    }
    if (url.protocol !== "https:") {
      throw this.error("INVALID_REQUEST", "Instagram only fetches media over HTTPS.");
    }
  }

  private validateImage(image: MediaAsset) {
    if (!IMAGE_TYPES.includes(image.mimeType)) {
      throw this.error("INVALID_REQUEST", "Instagram only accepts JPEG images.");
    }
    if (image.size !== undefined && image.size > MAX_IMAGE_BYTES) {
      throw this.error("INVALID_REQUEST", "Instagram images have to be 8 MB or smaller.");
    }
    this.validatePublicUrl(image);
  }

  private validateVideo(video: MediaAsset) {
    if (!VIDEO_TYPES.includes(video.mimeType)) {
      throw this.error("INVALID_REQUEST", `Instagram doesn't accept ${video.mimeType} video.`);
    }
    if (video.size !== undefined && video.size > MAX_VIDEO_BYTES) {
      throw this.error("INVALID_REQUEST", "Instagram videos have to be 300 MB or smaller.");
    }
    this.validatePublicUrl(video);
  }

  private async createContainer(
    igUserId: string,
    token: string,
    form: Record<string, string | number | boolean | undefined>,
  ): Promise<string> {
    const body = await this.graph.request({
      path: `/${igUserId}/media`,
      method: "POST",
      form,
      accessToken: token,
    });
    return requireString(this, body, "id");
  }

  /**
   * Waits for Meta to finish fetching the media. Images are usually ready at
   * once; video and reels are not, and publishing an unfinished container fails.
   */
  private async awaitContainer(containerId: string, token: string): Promise<void> {
    const deadline = this.now().getTime() + POLL_TIMEOUT_MS;
    for (;;) {
      const body = await this.graph.request({
        path: `/${containerId}`,
        query: { fields: "status_code,status" },
        accessToken: token,
      });
      const status = isRecord(body) ? body.status_code : null;
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") {
        const detail = isRecord(body) && typeof body.status === "string" ? body.status : null;
        throw this.error(
          "INVALID_REQUEST",
          detail
            ? `Instagram couldn't process the media: ${detail}`
            : "Instagram couldn't process the media.",
        );
      }
      if (this.now().getTime() >= deadline) {
        // Nothing has been published yet, so this is safe to retry.
        throw new SocialProviderError(
          "PROVIDER_ERROR",
          "Instagram is still processing the media. Try again shortly.",
          { platform: this.platform, retryable: true },
        );
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * The publish step. A timeout here is the dangerous case: the post may be
   * live, so it's flagged outcomeUnknown and the scheduler stops instead of
   * publishing twice.
   */
  private async publishContainer(
    igUserId: string,
    token: string,
    containerId: string,
  ): Promise<PublishResult> {
    const body = await this.graph.request({
      path: `/${igUserId}/media_publish`,
      method: "POST",
      form: { creation_id: containerId },
      accessToken: token,
    });
    const mediaId = requireString(this, body, "id");
    return {
      providerPostId: mediaId,
      url: await this.permalink(mediaId, token),
      publishedAt: this.now(),
    };
  }

  /** Best effort: a published post is still a success if we can't read its link. */
  private async permalink(mediaId: string, token: string): Promise<string | null> {
    try {
      const body = await this.graph.request({
        path: `/${mediaId}`,
        query: { fields: "permalink" },
        accessToken: token,
      });
      return isRecord(body) && typeof body.permalink === "string" ? body.permalink : null;
    } catch {
      return null;
    }
  }

  override async publishImage(
    credentials: ProviderCredentials,
    { text = "", images }: PublishImageInput,
  ): Promise<PublishResult> {
    const { igUserId, token } = this.account(credentials);
    if (images.length === 0) {
      throw this.error("INVALID_REQUEST", "Instagram posts need at least one image.");
    }
    if (images.length > MAX_CAROUSEL_ITEMS) {
      throw this.error(
        "INVALID_REQUEST",
        `Instagram carousels take up to ${MAX_CAROUSEL_ITEMS} items.`,
      );
    }
    for (const image of images) this.validateImage(image);
    const caption = this.validateCaption(text);

    if (images.length === 1) {
      const container = await this.createContainer(igUserId, token, {
        image_url: images[0].url,
        caption: caption || undefined,
        alt_text: images[0].altText,
      });
      await this.awaitContainer(container, token);
      return this.publishContainer(igUserId, token, container);
    }

    // Carousel: one container per item, then a parent that holds them.
    const children: string[] = [];
    for (const image of images) {
      children.push(
        await this.createContainer(igUserId, token, {
          image_url: image.url,
          alt_text: image.altText,
          is_carousel_item: true,
        }),
      );
    }
    for (const child of children) await this.awaitContainer(child, token);

    const parent = await this.createContainer(igUserId, token, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: caption || undefined,
    });
    await this.awaitContainer(parent, token);
    return this.publishContainer(igUserId, token, parent);
  }

  /**
   * Instagram publishes all video as Reels; "standard" and "short" differ only
   * in whether the reel is also shown in the main feed.
   */
  override async publishVideo(
    credentials: ProviderCredentials,
    { text = "", video, format, thumbnail }: PublishVideoInput,
  ): Promise<PublishResult> {
    const { igUserId, token } = this.account(credentials);
    this.validateVideo(video);
    if (thumbnail) this.validatePublicUrl(thumbnail);
    const caption = this.validateCaption(text);

    const container = await this.createContainer(igUserId, token, {
      media_type: "REELS",
      video_url: video.url,
      caption: caption || undefined,
      cover_url: thumbnail?.url,
      share_to_feed: format === "standard",
    });
    await this.awaitContainer(container, token);
    return this.publishContainer(igUserId, token, container);
  }

  override async getPost(
    credentials: ProviderCredentials,
    providerPostId: string,
  ): Promise<ProviderPost> {
    const { token } = this.account(credentials);
    const body = await this.graph.request({
      path: `/${providerPostId}`,
      query: { fields: "id,caption,permalink,timestamp" },
      accessToken: token,
    });
    const record = isRecord(body) ? body : {};
    return {
      providerPostId: requireString(this, body, "id"),
      url: typeof record.permalink === "string" ? record.permalink : null,
      text: typeof record.caption === "string" ? record.caption : null,
      publishedAt: typeof record.timestamp === "string" ? new Date(record.timestamp) : null,
    };
  }

  /**
   * Media and account insights.
   *
   * Instagram's media-level `impressions` was removed for anything created
   * after July 2024 and the account-level one in v22.0, so `views` is what's
   * reported and nothing stands in for impressions.
   * https://developers.facebook.com/docs/instagram-platform/insights
   */
  override async getAnalytics(
    credentials: ProviderCredentials,
    query: AnalyticsQuery,
  ): Promise<AnalyticsResult> {
    const { igUserId, token } = this.account(credentials);
    const fetchedAt = this.now();

    if (query.providerPostId) {
      const body = await this.graph.request({
        path: `/${query.providerPostId}/insights`,
        query: { metric: "views,reach,likes,comments,shares,saved" },
        accessToken: token,
      });
      const values = readInsightValues(body);
      return {
        metrics: definedMetrics({
          views: count(values.views),
          reach: count(values.reach),
          likes: count(values.likes),
          comments: count(values.comments),
          shares: count(values.shares),
          // Media-level uses "saved"; the account-level metric is "saves".
          saves: count(values.saved),
        }),
        raw: values,
        periodStart: null,
        periodEnd: null,
        fetchedAt,
      };
    }

    const body = await this.graph.request({
      path: `/${igUserId}`,
      query: { fields: "followers_count" },
      accessToken: token,
    });
    const record = isRecord(body) ? body : {};
    return {
      metrics: definedMetrics({ followers: count(record.followers_count) }),
      raw: record,
      periodStart: null,
      periodEnd: null,
      fetchedAt,
    };
  }

  /**
   * How much of the rolling 24-hour publishing quota is left. Meta's own docs
   * disagree on the ceiling (50 in the reference, 100 in the guide), so the
   * number is read from the account rather than assumed.
   */
  async getPublishingLimit(
    credentials: ProviderCredentials,
  ): Promise<{ used: number; total: number | null }> {
    const { igUserId, token } = this.account(credentials);
    const body = await this.graph.request({
      path: `/${igUserId}/content_publishing_limit`,
      query: { fields: "quota_usage,config" },
      accessToken: token,
    });
    const row = isRecord(body) && Array.isArray(body.data) ? body.data.find(isRecord) : null;
    const config = row && isRecord(row.config) ? row.config : null;
    return {
      used: typeof row?.quota_usage === "number" ? row.quota_usage : 0,
      total: typeof config?.quota_total === "number" ? config.quota_total : null,
    };
  }
}

/** Insights come back as `data: [{ name, values: [{ value }] }]`. */
const readInsightValues = (body: unknown): Record<string, unknown> => {
  const rows = isRecord(body) && Array.isArray(body.data) ? body.data.filter(isRecord) : [];
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name : null;
    if (!name) continue;
    const first = Array.isArray(row.values) ? row.values.find(isRecord) : null;
    values[name] = first?.value ?? row.total_value;
  }
  return values;
};

export const createInstagramProvider = () =>
  new InstagramProvider({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_INSTAGRAM_REDIRECT_URI,
    graphVersion: env.META_GRAPH_VERSION,
  });
