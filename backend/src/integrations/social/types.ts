/** Platform-neutral shapes passed between the app and social providers. */

export interface ProviderOAuthConfig {
  /** Scopes requested during authorization. */
  scopes: string[];
  /** Whether the authorization flow uses PKCE (the verifier is stored encrypted until the callback). */
  usesPkce: boolean;
  /**
   * The provider's registered callback URL. Defaults to
   * `FRONTEND_URL/api/v1/social-accounts/<platform>/callback`.
   */
  redirectUri?: string;
  /**
   * Refresh this long before the access token expires, instead of at the last
   * minute. For platforms whose tokens can only be refreshed while still valid
   * (Instagram), so an account nobody uses for a while doesn't silently lapse.
   */
  refreshBeforeExpiryMs?: number;
}

/**
 * One way of signing in to a platform, for platforms that offer more than one
 * (Instagram: directly, or through a Facebook Page).
 */
export interface LoginMethod {
  id: string;
  label: string;
  /** Its app credentials are configured on this server. */
  available: boolean;
}

export interface AuthorizationRequestInput {
  /** Opaque, single-use value the provider must return unchanged. */
  state: string;
  redirectUri: string;
  /** Which `LoginMethod` to use, for providers that have several. */
  loginMethod?: string;
}

export interface AuthorizationRequest {
  url: string;
  /** PKCE code verifier to keep server-side until the callback. */
  codeVerifier?: string;
}

export interface OAuthCallbackInput {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  /** The login method the flow was started with. */
  loginMethod?: string;
}

export interface OAuthTokenSet {
  accessToken: string;
  /** Omitted when the platform doesn't issue or rotate refresh tokens. */
  refreshToken?: string | null;
  expiresAt?: Date | null;
  /** When the refresh token itself expires, if the platform says. */
  refreshTokenExpiresAt?: Date | null;
  scopes: string[];
}

export interface SocialProfile {
  /** Stable id of the account on the platform (member, page, channel…). */
  providerAccountId: string;
  accountName: string;
  username?: string | null;
  profileImage?: string | null;
  /** Non-secret platform details (e.g. account type). Never put tokens here. */
  metadata?: Record<string, unknown>;
}

export interface OAuthConnection {
  tokens: OAuthTokenSet;
  profile: SocialProfile;
  /**
   * The login covers exactly this account, so there's nothing to choose even on
   * a provider that implements `listConnectionTargets`.
   */
  singleAccount?: boolean;
}

/**
 * One account a single authorization could connect. Platforms where a login
 * covers several destinations (Facebook Pages, Instagram professional accounts)
 * list them so the user picks, instead of us guessing.
 */
export interface ConnectionTarget {
  /** Platform id of the destination, passed back to `connectTarget`. */
  id: string;
  name: string;
  username?: string | null;
  image?: string | null;
  /** Short context, e.g. the Page an Instagram account is linked to. */
  description?: string | null;
}

/** What a token refresh knows about the account it's for. */
export interface RefreshContext {
  metadata: Record<string, unknown>;
}

/** Decrypted credentials handed to a provider for a single operation. Never persisted or logged. */
export interface ProviderCredentials {
  accessToken: string;
  providerAccountId: string;
  metadata: Record<string, unknown>;
}

export interface MediaAsset {
  /** Publicly reachable URL (e.g. from the media library). */
  url: string;
  mimeType: string;
  altText?: string;
  size?: number;
  /** Video shape, when known. Platforms decide what a short-form video is from these. */
  durationSeconds?: number;
  width?: number;
  height?: number;
  /** Reads the file from our storage. Providers that upload media use this instead of fetching `url`. */
  read?: () => Promise<Buffer>;
}

export interface PublishTextInput {
  text: string;
}

export interface PublishImageInput {
  text?: string;
  /** One image = image post; several = carousel. */
  images: MediaAsset[];
}

export type VideoFormat = "standard" | "short";

export interface PublishVideoInput {
  text?: string;
  title?: string;
  video: MediaAsset;
  /** "short" = Reels / Shorts / TikTok-style vertical video. */
  format: VideoFormat;
  thumbnail?: MediaAsset;
}

export interface PublishResult {
  providerPostId: string;
  url: string | null;
  publishedAt: Date;
}

export interface ProviderPost {
  providerPostId: string;
  url: string | null;
  text: string | null;
  publishedAt: Date | null;
}

export interface AnalyticsQuery {
  /** Post-level metrics when set; account-level otherwise. */
  providerPostId?: string;
  since?: Date;
  until?: Date;
}

/**
 * Each platform reports a different subset. A metric the platform doesn't
 * report is left out rather than set to zero, so "none" and "we weren't told"
 * stay distinguishable.
 */
export interface AnalyticsMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  saves?: number;
  followers?: number;
}

export interface AnalyticsResult {
  metrics: AnalyticsMetrics;
  /** The provider's own payload, kept beside the normalized numbers. */
  raw: Record<string, unknown>;
  periodStart: Date | null;
  periodEnd: Date | null;
  fetchedAt: Date;
}
