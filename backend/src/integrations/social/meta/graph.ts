/**
 * Shared Meta Graph API plumbing for the Facebook and Instagram providers.
 *
 * Facebook, and Instagram through Facebook Login, go to graph.facebook.com.
 * Instagram through Instagram Login goes to graph.instagram.com, which speaks
 * the same request and error format. So request, error and pagination handling
 * live here once. Nothing in this file is platform-specific beyond the
 * `platform` passed in for errors.
 *
 * Docs: https://developers.facebook.com/docs/graph-api/
 */
import type { SocialPlatformValue } from "../../../constants/social.constant";
import { SocialProviderError, type SocialProviderErrorKindValue } from "../errors";
import { type FetchLike, isRecord, providerFetch, readJson, retryAfterSeconds } from "../http";

export const GRAPH_HOST = "https://graph.facebook.com";
/** Uploads for resumable video go to their own host. */
export const RUPLOAD_HOST = "https://rupload.facebook.com";
export const FACEBOOK_DIALOG_HOST = "https://www.facebook.com";
/** Instagram API with Instagram Login: consent, code exchange and API calls. */
export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";
export const INSTAGRAM_OAUTH_HOST = "https://api.instagram.com";
export const INSTAGRAM_DIALOG_HOST = "https://www.instagram.com";

/** Shape of the `error` object Meta returns on failure. */
interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

const readGraphError = (body: unknown): GraphError | null => {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return body.error as GraphError;
};

/**
 * What we show the user. `error_user_msg` is Meta's own user-facing text and is
 * the most useful; otherwise the developer message, truncated so a platform
 * payload can never flood a log line or a toast.
 */
const describeGraphError = (error: GraphError | null): string | null => {
  const text = error?.error_user_msg ?? error?.message;
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 200 ? `${clean.slice(0, 199)}…` : clean || null;
};

/**
 * Graph error codes worth treating differently. Meta reuses code 100 for both
 * "you sent something invalid" and "this app isn't allowed to do that for this
 * user", so the subcode and message matter.
 * https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const PERMISSION_CODES = new Set([10, 200, 299, 3, 33]);
const TRANSIENT_CODES = new Set([1, 2]);

/**
 * Token problems: the user must reconnect, since Meta issues no refresh token.
 * Only the codes count. `type: "OAuthException"` is far broader than the name
 * suggests, covering permission and validation failures as well.
 */
const TOKEN_CODES = new Set([102, 190]);
const isTokenError = (error: GraphError | null) =>
  Boolean(error?.code && TOKEN_CODES.has(error.code));

export type GraphContext = "token-exchange" | "api";

export interface GraphProviderRef {
  platform: SocialPlatformValue;
  displayName: string;
}

/** Maps an HTTP status plus Meta's error body onto one of our error kinds. */
export const toGraphError = (
  provider: GraphProviderRef,
  response: Response,
  body: unknown,
  context: GraphContext,
): SocialProviderError => {
  const error = readGraphError(body);
  const detail = describeGraphError(error);
  const fail = (
    kind: SocialProviderErrorKindValue,
    message: string,
    options: { retryable?: boolean; retryAfterSeconds?: number } = {},
  ) =>
    new SocialProviderError(kind, message, {
      platform: provider.platform,
      ...options,
      cause: error ?? undefined,
    });

  if (context === "token-exchange") {
    return response.status >= 500
      ? fail("PROVIDER_ERROR", `${provider.displayName} couldn't complete sign-in. Try again.`, {
          retryable: true,
        })
      : fail("INVALID_REQUEST", `${provider.displayName} rejected the sign-in attempt.`);
  }

  if (error?.code && RATE_LIMIT_CODES.has(error.code)) {
    return fail("RATE_LIMITED", `${provider.displayName} is rate limiting this account.`, {
      retryAfterSeconds: retryAfterSeconds(response),
    });
  }
  if (response.status === 429) {
    return fail("RATE_LIMITED", `${provider.displayName} is rate limiting this account.`, {
      retryAfterSeconds: retryAfterSeconds(response),
    });
  }
  if (isTokenError(error) || response.status === 401) {
    return fail(
      "REAUTH_REQUIRED",
      `${provider.displayName} access has expired. Reconnect the account.`,
    );
  }
  // 368 is "temporarily blocked for policy violations": a person has to sort it out.
  if (error?.code === 368) {
    return fail("ACCOUNT_RESTRICTED", detail ?? `${provider.displayName} restricted this account.`);
  }
  if ((error?.code && PERMISSION_CODES.has(error.code)) || response.status === 403) {
    return fail(
      "PERMISSION_DENIED",
      detail ??
        `${provider.displayName} denied this action. Reconnect and approve the permissions it asks for.`,
    );
  }
  if (error?.code && TRANSIENT_CODES.has(error.code)) {
    return fail(
      "PROVIDER_ERROR",
      `${provider.displayName} had a temporary problem. Trying again.`,
      {
        retryable: true,
      },
    );
  }
  if (response.status >= 500) {
    return fail("PROVIDER_ERROR", `${provider.displayName} is having trouble. Trying again.`, {
      retryable: true,
    });
  }
  return fail("INVALID_REQUEST", detail ?? `${provider.displayName} rejected the request.`);
};

export interface GraphClientConfig {
  version: string;
  /** Defaults to graph.facebook.com. */
  host?: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

export interface GraphRequest {
  /** Path after the version, e.g. "/me/accounts". A full URL is used as given. */
  path: string;
  method?: "GET" | "POST" | "DELETE";
  /** Query string values; undefined entries are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Sent form-encoded, the way the Graph API expects POST bodies. */
  form?: Record<string, string | number | boolean | undefined>;
  accessToken?: string;
  context?: GraphContext;
}

/**
 * One Graph API call. The access token goes in the Authorization header rather
 * than the query string so it never lands in an intermediary's access log.
 */
const TRUSTED_GRAPH_HOSTS = new Set([
  new URL(GRAPH_HOST).hostname,
  new URL(INSTAGRAM_GRAPH_HOST).hostname,
  // Only the Instagram Login code exchange goes here.
  new URL(INSTAGRAM_OAUTH_HOST).hostname,
]);

export class GraphClient {
  constructor(
    private readonly provider: GraphProviderRef,
    private readonly config: GraphClientConfig,
  ) {}

  get version(): string {
    return this.config.version;
  }

  url(path: string, query: GraphRequest["query"] = {}): string {
    const base = path.startsWith("https://")
      ? path
      : `${this.config.host ?? GRAPH_HOST}/${this.config.version}${path.startsWith("/") ? path : `/${path}`}`;
    const url = new URL(base);
    // Absolute URLs come from API responses (paging links). The access token goes
    // with every request, so only Meta's own Graph hosts are ever called.
    if (!TRUSTED_GRAPH_HOSTS.has(url.hostname)) {
      throw new SocialProviderError("PROVIDER_ERROR", "Meta returned an unexpected link.", {
        platform: this.provider.platform,
      });
    }
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request({
    path,
    method = "GET",
    query,
    form,
    accessToken,
    context = "api",
  }: GraphRequest): Promise<unknown> {
    const init: RequestInit = { method };
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (form) {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(form)) {
        if (value !== undefined) body.set(key, String(value));
      }
      init.body = body.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    init.headers = headers;

    const response = await providerFetch(
      this.config.fetch,
      this.provider,
      this.url(path, query),
      init,
      this.config.timeoutMs,
    );
    const body = await readJson(response);
    if (!response.ok) throw toGraphError(this.provider, response, body, context);
    return body;
  }

  /** Follows `paging.next` so a user with many Pages isn't silently truncated. */
  async collect(request: GraphRequest, maxPages = 10): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let next: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const body = await this.request(
        next ? { path: next, accessToken: request.accessToken } : request,
      );
      if (!isRecord(body) || !Array.isArray(body.data)) break;
      items.push(...body.data.filter(isRecord));
      const paging = isRecord(body.paging) ? body.paging : null;
      next = typeof paging?.next === "string" ? paging.next : undefined;
      if (!next) break;
    }
    return items;
  }
}

/** Reads a required string field, failing with a provider error rather than undefined. */
export const requireString = (provider: GraphProviderRef, body: unknown, field: string): string => {
  const value = isRecord(body) ? body[field] : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new SocialProviderError(
      "PROVIDER_ERROR",
      `${provider.displayName} returned an unexpected response.`,
      { platform: provider.platform, retryable: true },
    );
  }
  return value;
};
