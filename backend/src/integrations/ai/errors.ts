import { emptyUsage, type TokenUsage } from "./types";

export const AIErrorKind = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  /** The API key was rejected or lacks access. */
  AUTHENTICATION: "AUTHENTICATION",
  /** The configured model doesn't exist or isn't available to this account. */
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  /** The provider rejected the request itself (a bug on our side, e.g. an invalid schema). */
  INVALID_REQUEST: "INVALID_REQUEST",
  RATE_LIMITED: "RATE_LIMITED",
  /** Out of credits or over a spend limit — retrying won't help. */
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  TIMEOUT: "TIMEOUT",
  /** The model refused, or the provider's content filter blocked the output. */
  REFUSED: "REFUSED",
  /** Output was cut off (e.g. max output tokens reached). */
  INCOMPLETE: "INCOMPLETE",
  /** Output wasn't valid JSON or didn't match the schema. */
  INVALID_OUTPUT: "INVALID_OUTPUT",
  PROVIDER_ERROR: "PROVIDER_ERROR",
} as const;
export type AIErrorKindValue = (typeof AIErrorKind)[keyof typeof AIErrorKind];

interface AIProviderErrorOptions {
  provider: string;
  retryable?: boolean;
  retryAfterMs?: number;
  status?: number;
  requestId?: string | null;
  usage?: TokenUsage;
  /** Provider detail for server logs only — may echo request content, never shown to users. */
  detail?: string;
  cause?: unknown;
}

/** The only error type providers throw. Messages never include credentials. */
export class AIProviderError extends Error {
  readonly kind: AIErrorKindValue;
  readonly provider: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly status?: number;
  readonly requestId: string | null;
  readonly detail?: string;
  /** Tokens billed before the failure, across attempts. Updated by the retry loop. */
  usage: TokenUsage;
  attempts = 1;

  constructor(kind: AIErrorKindValue, message: string, options: AIProviderErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "AIProviderError";
    this.kind = kind;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
    this.requestId = options.requestId ?? null;
    this.detail = options.detail;
    this.usage = options.usage ?? emptyUsage();
  }
}
