import type { SocialPlatformValue } from "../../constants/social.constant";
import { CAPABILITY_LABELS, type SocialCapability } from "./capabilities";
import { SocialProviderError } from "./errors";
import type {
  AnalyticsQuery,
  AnalyticsResult,
  ConnectionTarget,
  AuthorizationRequest,
  LoginMethod,
  AuthorizationRequestInput,
  OAuthCallbackInput,
  OAuthConnection,
  OAuthTokenSet,
  ProviderCredentials,
  ProviderOAuthConfig,
  ProviderPost,
  PublishImageInput,
  PublishResult,
  PublishTextInput,
  PublishVideoInput,
  RefreshContext,
  SocialProfile,
} from "./types";

/** Everything a platform integration can do. Optional operations are gated by capabilities. */
export interface SocialOperations {
  getAuthorizationUrl(input: AuthorizationRequestInput): Promise<AuthorizationRequest>;
  /** Exchanges the authorization code and returns tokens plus the connected profile. */
  handleOAuthCallback(input: OAuthCallbackInput): Promise<OAuthConnection>;
  /**
   * `account` carries the stored account's metadata, for providers whose
   * accounts can come from different apps (LinkedIn profiles and Pages).
   */
  refreshAccessToken(refreshToken: string, account?: RefreshContext): Promise<OAuthTokenSet>;
  getProfile(credentials: ProviderCredentials): Promise<SocialProfile>;
  publishText(credentials: ProviderCredentials, input: PublishTextInput): Promise<PublishResult>;
  publishImage(credentials: ProviderCredentials, input: PublishImageInput): Promise<PublishResult>;
  publishVideo(credentials: ProviderCredentials, input: PublishVideoInput): Promise<PublishResult>;
  getPost(credentials: ProviderCredentials, providerPostId: string): Promise<ProviderPost>;
  deletePost(credentials: ProviderCredentials, providerPostId: string): Promise<void>;
  getAnalytics(credentials: ProviderCredentials, query: AnalyticsQuery): Promise<AnalyticsResult>;
  /**
   * Optional. Platforms where one authorization can manage several accounts
   * implement both of these: the user is shown the targets and picks one, which
   * is then turned into the account we store. Providers without them connect
   * whatever `handleOAuthCallback` returned.
   */
  listConnectionTargets?(tokens: OAuthTokenSet): Promise<ConnectionTarget[]>;
  connectTarget?(tokens: OAuthTokenSet, targetId: string): Promise<OAuthConnection>;
}

/**
 * A platform integration. Providers are stateless: they receive decrypted
 * credentials per call and never store, log or return tokens anywhere except
 * the `OAuthTokenSet` results, which the service encrypts immediately.
 */
export interface SocialProvider extends SocialOperations {
  readonly platform: SocialPlatformValue;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<SocialCapability>;
  readonly oauth: ProviderOAuthConfig;
  /** True when the integration is implemented and its app credentials are configured. */
  isAvailable(): boolean;
  supports(capability: SocialCapability): boolean;
  /**
   * Optional. Platforms with more than one way to sign in list them here, the
   * default first. The chosen id is passed back to `getAuthorizationUrl` and
   * `handleOAuthCallback`.
   */
  listLoginMethods?(): LoginMethod[];
}

/**
 * Base class for providers. OAuth and profile methods must be implemented; every
 * capability-gated operation rejects with UNSUPPORTED_CAPABILITY unless overridden.
 */
export abstract class BaseSocialProvider implements SocialProvider {
  abstract readonly platform: SocialPlatformValue;
  abstract readonly displayName: string;
  abstract readonly capabilities: ReadonlySet<SocialCapability>;
  abstract readonly oauth: ProviderOAuthConfig;

  abstract isAvailable(): boolean;
  abstract getAuthorizationUrl(input: AuthorizationRequestInput): Promise<AuthorizationRequest>;
  abstract handleOAuthCallback(input: OAuthCallbackInput): Promise<OAuthConnection>;
  abstract getProfile(credentials: ProviderCredentials): Promise<SocialProfile>;

  supports(capability: SocialCapability): boolean {
    return this.capabilities.has(capability);
  }

  protected unsupported(capability: SocialCapability, ...context: unknown[]): Promise<never> {
    void context;
    return Promise.reject(
      new SocialProviderError(
        "UNSUPPORTED_CAPABILITY",
        `${this.displayName} doesn't support ${CAPABILITY_LABELS[capability]}`,
        { platform: this.platform },
      ),
    );
  }

  refreshAccessToken(refreshToken: string, account?: RefreshContext): Promise<OAuthTokenSet> {
    return this.unsupported("TOKEN_REFRESH", refreshToken, account);
  }

  publishText(credentials: ProviderCredentials, input: PublishTextInput): Promise<PublishResult> {
    return this.unsupported("TEXT_POST", credentials, input);
  }

  publishImage(credentials: ProviderCredentials, input: PublishImageInput): Promise<PublishResult> {
    return this.unsupported("IMAGE_POST", credentials, input);
  }

  publishVideo(credentials: ProviderCredentials, input: PublishVideoInput): Promise<PublishResult> {
    return this.unsupported("VIDEO_POST", credentials, input);
  }

  getPost(credentials: ProviderCredentials, providerPostId: string): Promise<ProviderPost> {
    return this.unsupported("READ_POST", credentials, providerPostId);
  }

  deletePost(credentials: ProviderCredentials, providerPostId: string): Promise<void> {
    return this.unsupported("DELETE_POST", credentials, providerPostId);
  }

  getAnalytics(credentials: ProviderCredentials, query: AnalyticsQuery): Promise<AnalyticsResult> {
    return this.unsupported("ANALYTICS", credentials, query);
  }
}
