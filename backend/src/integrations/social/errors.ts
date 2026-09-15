import type { SocialPlatformValue } from "../../constants/social.constant";

export const SocialProviderErrorKind = {
  /** No provider registered, or app credentials missing. */
  NOT_CONFIGURED: "NOT_CONFIGURED",
  /** The integration for this platform hasn't been built yet. */
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  /** The platform (or this provider) can't do the requested operation. */
  UNSUPPORTED_CAPABILITY: "UNSUPPORTED_CAPABILITY",
  /** The platform rejected the input (bad media, text too long, unknown post…). */
  INVALID_REQUEST: "INVALID_REQUEST",
  /** Access token expired; a refresh may fix it. */
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  /** Access was revoked or refresh failed; the user must reconnect. */
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  /** The account itself is restricted or unusable on the platform. */
  ACCOUNT_RESTRICTED: "ACCOUNT_RESTRICTED",
  /** The token is valid but lacks a permission (scope); the user must reconnect and approve it. */
  PERMISSION_DENIED: "PERMISSION_DENIED",
  RATE_LIMITED: "RATE_LIMITED",
  /** Unexpected platform failure (5xx, malformed response, network). */
  PROVIDER_ERROR: "PROVIDER_ERROR",
} as const;
export type SocialProviderErrorKindValue =
  (typeof SocialProviderErrorKind)[keyof typeof SocialProviderErrorKind];

interface SocialProviderErrorOptions {
  platform: SocialPlatformValue;
  retryable?: boolean;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/**
 * The only error type providers should throw. The service maps each kind onto an
 * account status change and an HTTP response, so platform details stay inside providers.
 * Messages may be shown to users — never include tokens or raw platform payloads.
 */
export class SocialProviderError extends Error {
  readonly kind: SocialProviderErrorKindValue;
  readonly platform: SocialPlatformValue;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: SocialProviderErrorKindValue,
    message: string,
    { platform, retryable, retryAfterSeconds, cause }: SocialProviderErrorOptions,
  ) {
    super(message, { cause });
    this.name = "SocialProviderError";
    this.kind = kind;
    this.platform = platform;
    this.retryable = retryable ?? (kind === "RATE_LIMITED" || kind === "PROVIDER_ERROR");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
