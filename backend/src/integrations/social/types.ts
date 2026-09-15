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
}

export interface AuthorizationRequestInput {
  /** Opaque, single-use value the provider must return unchanged. */
  state: string;
  redirectUri: string;
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

/** Each platform reports a different subset. */
export interface AnalyticsMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  followers?: number;
}

export interface AnalyticsResult {
  metrics: AnalyticsMetrics;
  periodStart: Date | null;
  periodEnd: Date | null;
  fetchedAt: Date;
}
