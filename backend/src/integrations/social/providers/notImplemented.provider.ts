import type { SocialPlatformValue } from "../../../constants/social.constant";
import type { SocialCapability } from "../capabilities";
import { SocialProviderError } from "../errors";
import { BaseSocialProvider } from "../provider";
import type {
  AnalyticsResult,
  AuthorizationRequest,
  OAuthConnection,
  OAuthTokenSet,
  ProviderOAuthConfig,
  ProviderPost,
  PublishResult,
  SocialProfile,
} from "../types";

export interface PlannedProviderDefinition {
  platform: SocialPlatformValue;
  displayName: string;
  /** What the finished integration will support. Verify against the platform's API before building. */
  capabilities: SocialCapability[];
  oauth: ProviderOAuthConfig;
  /** Environment variables the real integration will need. */
  credentialEnv: string[];
  docsUrl: string;
}

/**
 * Placeholder for a platform whose API isn't built yet. It advertises the planned
 * capabilities so the rest of the app can plan around them, is never available,
 * and every operation throws NOT_IMPLEMENTED.
 *
 * To build a platform: create a class extending BaseSocialProvider in its file,
 * implement the OAuth, profile and capability methods, and return it from the factory.
 */
export class NotImplementedSocialProvider extends BaseSocialProvider {
  readonly platform: SocialPlatformValue;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<SocialCapability>;
  readonly oauth: ProviderOAuthConfig;
  readonly credentialEnv: readonly string[];
  readonly docsUrl: string;

  constructor(definition: PlannedProviderDefinition) {
    super();
    this.platform = definition.platform;
    this.displayName = definition.displayName;
    this.capabilities = new Set(definition.capabilities);
    this.oauth = definition.oauth;
    this.credentialEnv = definition.credentialEnv;
    this.docsUrl = definition.docsUrl;
  }

  isAvailable(): boolean {
    return false;
  }

  private notImplemented(operation: string): Promise<never> {
    return Promise.reject(
      new SocialProviderError(
        "NOT_IMPLEMENTED",
        `The ${this.displayName} integration isn't available yet (${operation})`,
        { platform: this.platform },
      ),
    );
  }

  override getAuthorizationUrl(): Promise<AuthorizationRequest> {
    return this.notImplemented("authorization");
  }

  override handleOAuthCallback(): Promise<OAuthConnection> {
    return this.notImplemented("authorization");
  }

  override refreshAccessToken(): Promise<OAuthTokenSet> {
    return this.notImplemented("token refresh");
  }

  override getProfile(): Promise<SocialProfile> {
    return this.notImplemented("profile");
  }

  override publishText(): Promise<PublishResult> {
    return this.notImplemented("text post");
  }

  override publishImage(): Promise<PublishResult> {
    return this.notImplemented("image post");
  }

  override publishVideo(): Promise<PublishResult> {
    return this.notImplemented("video post");
  }

  override getPost(): Promise<ProviderPost> {
    return this.notImplemented("read post");
  }

  override deletePost(): Promise<void> {
    return this.notImplemented("delete post");
  }

  override getAnalytics(): Promise<AnalyticsResult> {
    return this.notImplemented("analytics");
  }
}
