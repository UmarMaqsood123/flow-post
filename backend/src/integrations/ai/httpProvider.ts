import { type FetchLike, isRecord, readJson } from "../social/http";
import { AIProviderError } from "./errors";
import {
  addUsage,
  type AIProvider,
  emptyUsage,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
  type TokenUsage,
} from "./types";

/** 429s that won't clear by waiting. */
const QUOTA_ERROR_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

export interface HttpProviderConfig {
  apiKey?: string;
  /** Without a trailing slash, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  defaultModel: string;
  /** Per attempt. */
  timeoutMs: number;
  /** Retries after the first attempt. */
  maxRetries: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const parseRetryAfterMs = (response: Response): number | undefined => {
  const milliseconds = Number(response.headers.get("retry-after-ms"));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds;
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

/** Whole positive numbers only; anything else counts as zero. */
export const tokenCount = (value: unknown) => (typeof value === "number" && value >= 0 ? value : 0);

/**
 * Shared machinery for AI providers spoken to over HTTP: one retry loop with
 * exponential backoff and jitter, one timeout, and one mapping from status codes
 * to error kinds. Subclasses only describe their own request and response shape.
 */
export abstract class BaseHttpAIProvider implements AIProvider {
  abstract readonly name: string;
  readonly defaultModel: string;
  protected readonly config: HttpProviderConfig;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(config: HttpProviderConfig) {
    this.config = config;
    this.defaultModel = config.defaultModel;
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = config.random ?? Math.random;
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiKey);
  }

  abstract estimateCostUsd(model: string, usage: TokenUsage): number | null;

  /** Sends one request and turns the answer into validated data. */
  protected abstract attempt<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<Omit<StructuredGenerationResult<T>, "attempts">>;

  /** Message for the NOT_CONFIGURED error when the provider can't run. */
  protected abstract missingConfigMessage(): string | null;

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const missing = this.missingConfigMessage();
    if (missing) {
      throw new AIProviderError("NOT_CONFIGURED", missing, { provider: this.name });
    }

    const maxAttempts = (request.maxRetries ?? this.config.maxRetries) + 1;
    let usage = emptyUsage();
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const result = await this.attempt(request);
        usage = addUsage(usage, result.usage);
        return { ...result, usage, attempts: attempt };
      } catch (error) {
        const failure =
          error instanceof AIProviderError
            ? error
            : new AIProviderError("PROVIDER_ERROR", "Unexpected error calling the AI provider", {
                provider: this.name,
                cause: error,
              });
        usage = addUsage(usage, failure.usage);
        if (!failure.retryable || attempt >= maxAttempts) {
          failure.usage = usage;
          failure.attempts = attempt;
          throw failure;
        }
        await this.sleep(this.retryDelayMs(attempt, failure.retryAfterMs));
      }
    }
  }

  /** Honors Retry-After (capped); otherwise exponential backoff with jitter. */
  private retryDelayMs(attempt: number, retryAfterMs?: number) {
    if (retryAfterMs !== undefined) return Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
    const ceiling = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
    return Math.round(ceiling / 2 + (this.random() * ceiling) / 2);
  }

  /** POSTs JSON with a timeout. Network errors and timeouts become retryable failures. */
  protected async post(path: string, body: unknown, timeoutMs: number): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    try {
      return await this.fetchImpl(`${this.config.baseUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: { ...headers, ...this.extraHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut =
        cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw new AIProviderError(
        timedOut ? "TIMEOUT" : "PROVIDER_ERROR",
        timedOut ? "The AI provider took too long to respond" : "Couldn't reach the AI provider",
        { provider: this.name, retryable: true, cause },
      );
    }
  }

  /** Headers a particular service needs on top of the standard ones. */
  protected extraHeaders(): Record<string, string> {
    return {};
  }

  protected requestId(response: Response): string | null {
    return response.headers.get("x-request-id") ?? response.headers.get("x-requestid");
  }

  protected async readBody(response: Response): Promise<Record<string, unknown>> {
    const payload = await readJson(response);
    return isRecord(payload) ? payload : {};
  }

  /** Maps an HTTP failure onto an error kind, keeping provider detail out of user messages. */
  protected httpError(response: Response, payload: unknown, requestId: string | null) {
    const { status } = response;
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    const code = typeof error.code === "string" ? error.code : null;
    const detail =
      typeof error.message === "string" ? error.message.slice(0, 300) : `HTTP ${status}`;
    const options = { provider: this.name, status, requestId, detail };

    if (status === 401 || status === 403) {
      return new AIProviderError(
        "AUTHENTICATION",
        "The AI provider rejected the credentials",
        options,
      );
    }
    if (status === 404 || code === "model_not_found") {
      return new AIProviderError(
        "MODEL_UNAVAILABLE",
        "The configured AI model isn't available",
        options,
      );
    }
    if (status === 402 || (status === 429 && code && QUOTA_ERROR_CODES.has(code))) {
      return new AIProviderError(
        "QUOTA_EXCEEDED",
        "The AI provider's usage quota is exhausted",
        options,
      );
    }
    if (status === 429) {
      return new AIProviderError("RATE_LIMITED", "The AI provider is rate limiting requests", {
        ...options,
        retryable: true,
        retryAfterMs: parseRetryAfterMs(response),
      });
    }
    if (RETRYABLE_STATUSES.has(status)) {
      return new AIProviderError(
        status === 408 ? "TIMEOUT" : "PROVIDER_ERROR",
        "The AI provider had a temporary problem",
        { ...options, retryable: true, retryAfterMs: parseRetryAfterMs(response) },
      );
    }
    if (status === 400 || status === 422) {
      return new AIProviderError(
        "INVALID_REQUEST",
        "The AI provider rejected the request",
        options,
      );
    }
    return new AIProviderError("PROVIDER_ERROR", "The AI provider returned an error", options);
  }

  /** Parses the model's text, then validates it against the request's schema. */
  protected parseOutput<T>(
    text: string,
    request: StructuredGenerationRequest<T>,
    fail: (kind: "INVALID_OUTPUT", message: string, retryable?: boolean) => AIProviderError,
  ): T {
    if (!text.trim()) throw fail("INVALID_OUTPUT", "The AI returned an empty response", true);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw fail("INVALID_OUTPUT", "The AI returned malformed JSON", true);
    }
    try {
      return request.schema.parse(parsed);
    } catch {
      throw fail("INVALID_OUTPUT", "The AI response didn't match the expected format", true);
    }
  }
}
