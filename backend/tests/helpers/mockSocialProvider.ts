import { createHash, randomUUID } from "node:crypto";
import type { SocialPlatformValue } from "../../src/constants/social.constant";
import type { SocialCapability } from "../../src/integrations/social/capabilities";
import {
  SocialProviderError,
  type SocialProviderErrorKindValue,
} from "../../src/integrations/social/errors";
import { BaseSocialProvider, type SocialOperations } from "../../src/integrations/social/provider";
import type {
  ConnectionTarget,
  AnalyticsQuery,
  AnalyticsResult,
  AuthorizationRequest,
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
  SocialProfile,
} from "../../src/integrations/social/types";

export interface MockSocialProviderOptions {
  platform?: SocialPlatformValue;
  displayName?: string;
  capabilities?: SocialCapability[];
  available?: boolean;
  usesPkce?: boolean;
  /** Access token lifetime; null = tokens never expire. */
  accessTokenTtlSeconds?: number | null;
}

const challengeFor = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

/**
 * In-memory SocialProvider for tests. It behaves like a real platform: fake OAuth
 * with optional PKCE, issued/validated/rotated tokens, stored posts, analytics and
 * one-off injected failures — so the abstraction can be tested end to end.
 *
 * Like a real provider, every operation is async: failures are rejected promises.
 */
export class MockSocialProvider extends BaseSocialProvider {
  readonly platform: SocialPlatformValue;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<SocialCapability>;
  readonly oauth: ProviderOAuthConfig;
  available: boolean;
  accessTokenTtlSeconds: number | null;

  /** Every provider call, in order, with the credentials it received. */
  readonly calls: { method: keyof SocialOperations; credentials?: ProviderCredentials }[] = [];
  /** Inputs passed to publish methods, in order. */
  readonly publishedInputs: (PublishTextInput | PublishImageInput | PublishVideoInput)[] = [];
  readonly issuedAccessTokens: string[] = [];
  private readonly validAccessTokens = new Set<string>();
  private readonly validRefreshTokens = new Set<string>();
  private readonly pendingCodes = new Map<string, string | null>();
  private readonly failures = new Map<keyof SocialOperations, SocialProviderError>();
  private readonly posts = new Map<string, ProviderPost>();
  private profile: SocialProfile = {
    providerAccountId: "mock-account-1",
    accountName: "Mock Company",
    username: "mockco",
    profileImage: "https://cdn.mock-social.test/avatar.png",
    metadata: { accountType: "organization" },
  };

  constructor(options: MockSocialProviderOptions = {}) {
    super();
    this.platform = options.platform ?? "LINKEDIN";
    this.displayName = options.displayName ?? "Mock Social";
    this.capabilities = new Set(
      options.capabilities ?? [
        "TEXT_POST",
        "IMAGE_POST",
        "READ_POST",
        "DELETE_POST",
        "ANALYTICS",
        "TOKEN_REFRESH",
      ],
    );
    this.oauth = { scopes: ["mock.read", "mock.publish"], usesPkce: options.usesPkce ?? false };
    this.available = options.available ?? true;
    this.accessTokenTtlSeconds =
      options.accessTokenTtlSeconds === undefined ? 3600 : options.accessTokenTtlSeconds;
  }

  isAvailable(): boolean {
    return this.available;
  }

  // ── Test controls ────────────────────────────────────────

  setProfile(changes: Partial<SocialProfile>) {
    this.profile = { ...this.profile, ...changes };
  }

  get currentProfileId(): string {
    return this.profile.providerAccountId;
  }

  /** The next call to `method` rejects with `error`. */
  failNext(method: keyof SocialOperations, error: SocialProviderError) {
    this.failures.set(method, error);
  }

  error(kind: SocialProviderErrorKindValue, message = `Mock ${kind}`) {
    return new SocialProviderError(kind, message, { platform: this.platform });
  }

  /** Simulates the user approving access; returns what the platform redirects back with. */
  approve(authorizationUrl: string): { code: string; state: string } {
    const url = new URL(authorizationUrl);
    const code = `mock-code-${randomUUID()}`;
    this.pendingCodes.set(code, url.searchParams.get("code_challenge"));
    return { code, state: url.searchParams.get("state") ?? "" };
  }

  /**
   * Turns this into a platform where one login covers several accounts, the way
   * Facebook Pages do. The optional methods only exist once this is called, so
   * providers without targets keep the single-account flow.
   */
  offerTargets(targets: ConnectionTarget[]) {
    this.targets = targets;
    this.listConnectionTargets = () => Promise.resolve(this.targets);
    this.connectTarget = (tokens: OAuthTokenSet, targetId: string) => {
      const target = this.targets.find((candidate) => candidate.id === targetId);
      if (!target) {
        return Promise.reject(this.error("INVALID_REQUEST", "That account is gone"));
      }
      this.connectedTargetIds.push(targetId);
      return Promise.resolve({
        tokens,
        profile: {
          providerAccountId: target.id,
          accountName: target.name,
          username: target.username ?? null,
          profileImage: target.image ?? null,
          metadata: { accountType: "page" },
        },
      });
    };
  }

  private targets: ConnectionTarget[] = [];
  /** Targets that were actually connected, in order. */
  readonly connectedTargetIds: string[] = [];
  listConnectionTargets?: (tokens: OAuthTokenSet) => Promise<ConnectionTarget[]>;
  connectTarget?: (tokens: OAuthTokenSet, targetId: string) => Promise<OAuthConnection>;

  /** Invalidates all access tokens, as if they expired or were revoked on the platform. */
  revokeAccessTokens() {
    this.validAccessTokens.clear();
  }

  countCalls(method: keyof SocialOperations) {
    return this.calls.filter((call) => call.method === method).length;
  }

  get lastAccessToken(): string {
    return this.issuedAccessTokens.at(-1) ?? "";
  }

  // ── Provider implementation ──────────────────────────────

  /** Records the call, then throws an injected failure or an invalid-token error. */
  private begin(method: keyof SocialOperations, credentials?: ProviderCredentials) {
    this.calls.push({ method, credentials });
    const failure = this.failures.get(method);
    if (failure) {
      this.failures.delete(method);
      throw failure;
    }
    if (credentials && !this.validAccessTokens.has(credentials.accessToken)) {
      throw this.error("TOKEN_EXPIRED", "Mock access token is not valid");
    }
  }

  private issueTokens(): OAuthTokenSet {
    const id = randomUUID();
    const accessToken = `mock-access-${id}`;
    const refreshToken = `mock-refresh-${id}`;
    this.validAccessTokens.add(accessToken);
    this.validRefreshTokens.add(refreshToken);
    this.issuedAccessTokens.push(accessToken);
    return {
      accessToken,
      refreshToken,
      expiresAt:
        this.accessTokenTtlSeconds === null
          ? null
          : new Date(Date.now() + this.accessTokenTtlSeconds * 1000),
      scopes: [...this.oauth.scopes],
    };
  }

  private storePost(text: string | null): PublishResult {
    const providerPostId = `mock-post-${randomUUID()}`;
    const publishedAt = new Date();
    const url = `https://mock-social.test/posts/${providerPostId}`;
    this.posts.set(providerPostId, { providerPostId, url, text, publishedAt });
    return { providerPostId, url, publishedAt };
  }

  async getAuthorizationUrl({
    state,
    redirectUri,
  }: AuthorizationRequestInput): Promise<AuthorizationRequest> {
    this.begin("getAuthorizationUrl");
    const url = new URL("https://auth.mock-social.test/oauth/authorize");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", this.oauth.scopes.join(" "));
    if (!this.oauth.usesPkce) return { url: url.toString() };

    const codeVerifier = `mock-verifier-${randomUUID()}`;
    url.searchParams.set("code_challenge", challengeFor(codeVerifier));
    return { url: url.toString(), codeVerifier };
  }

  async handleOAuthCallback({ code, codeVerifier }: OAuthCallbackInput): Promise<OAuthConnection> {
    this.begin("handleOAuthCallback");
    if (!this.pendingCodes.has(code)) {
      throw this.error("INVALID_REQUEST", "Unknown or reused authorization code");
    }
    const challenge = this.pendingCodes.get(code);
    this.pendingCodes.delete(code);
    if (challenge && (!codeVerifier || challengeFor(codeVerifier) !== challenge)) {
      throw this.error("INVALID_REQUEST", "PKCE verification failed");
    }
    return { tokens: this.issueTokens(), profile: { ...this.profile } };
  }

  override async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    this.begin("refreshAccessToken");
    if (!this.validRefreshTokens.has(refreshToken)) {
      throw this.error("REAUTH_REQUIRED", "Mock refresh token is not valid");
    }
    this.validRefreshTokens.delete(refreshToken);
    return this.issueTokens();
  }

  async getProfile(credentials: ProviderCredentials): Promise<SocialProfile> {
    this.begin("getProfile", credentials);
    return { ...this.profile };
  }

  override async publishText(
    credentials: ProviderCredentials,
    input: PublishTextInput,
  ): Promise<PublishResult> {
    this.begin("publishText", credentials);
    this.publishedInputs.push(input);
    return this.storePost(input.text);
  }

  override async publishImage(
    credentials: ProviderCredentials,
    input: PublishImageInput,
  ): Promise<PublishResult> {
    this.begin("publishImage", credentials);
    this.publishedInputs.push(input);
    return this.storePost(input.text ?? null);
  }

  override async publishVideo(
    credentials: ProviderCredentials,
    input: PublishVideoInput,
  ): Promise<PublishResult> {
    this.begin("publishVideo", credentials);
    this.publishedInputs.push(input);
    return this.storePost(input.text ?? input.title ?? null);
  }

  override async getPost(
    credentials: ProviderCredentials,
    providerPostId: string,
  ): Promise<ProviderPost> {
    this.begin("getPost", credentials);
    const post = this.posts.get(providerPostId);
    if (!post) throw this.error("INVALID_REQUEST", "Post not found");
    return post;
  }

  override async deletePost(
    credentials: ProviderCredentials,
    providerPostId: string,
  ): Promise<void> {
    this.begin("deletePost", credentials);
    if (!this.posts.delete(providerPostId)) throw this.error("INVALID_REQUEST", "Post not found");
  }

  override async getAnalytics(
    credentials: ProviderCredentials,
    query: AnalyticsQuery,
  ): Promise<AnalyticsResult> {
    this.begin("getAnalytics", credentials);
    return {
      metrics: query.providerPostId
        ? { views: 1200, likes: 48, comments: 6, shares: 3 }
        : { followers: 900 },
      raw: { mock: true },
      periodStart: query.since ?? null,
      periodEnd: query.until ?? null,
      fetchedAt: new Date(),
    };
  }
}
