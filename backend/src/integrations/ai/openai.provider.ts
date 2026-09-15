import { type FetchLike, isRecord, readJson } from "../social/http";
import { AIProviderError, type AIErrorKindValue } from "./errors";
import { estimateOpenAICostUsd } from "./pricing";
import {
  addUsage,
  type AIProvider,
  emptyUsage,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
  type TokenUsage,
} from "./types";

/** Used when OPENAI_MODEL isn't set. Check it's available to your account. */
export const OPENAI_DEFAULT_MODEL = "gpt-5.6-terra";

/** 429s that won't clear by waiting. */
const QUOTA_ERROR_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

export interface OpenAIProviderConfig {
  apiKey?: string;
  /** e.g. https://api.openai.com/v1 */
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

const parseUsage = (value: unknown): TokenUsage => {
  if (!isRecord(value)) return emptyUsage();
  const number = (input: unknown) => (typeof input === "number" && input >= 0 ? input : 0);
  const details = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  return {
    inputTokens: number(value.input_tokens),
    outputTokens: number(value.output_tokens),
    cachedInputTokens: number(details.cached_tokens),
  };
};

/** Collects output text and any refusal from a Responses API `output` array. */
const extractContent = (output: unknown) => {
  let text = "";
  let refusal: string | null = null;
  for (const item of Array.isArray(output) ? output : []) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!isRecord(part)) continue;
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
      if (part.type === "refusal") refusal = typeof part.refusal === "string" ? part.refusal : "";
    }
  }
  return { text, refusal };
};

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

/**
 * OpenAI via the Responses API with strict JSON-schema structured outputs.
 * Plain fetch keeps the provider small, dependency-free and testable with a fake fetch.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly defaultModel: string;
  private readonly config: OpenAIProviderConfig;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
    this.defaultModel = config.defaultModel;
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = config.random ?? Math.random;
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiKey);
  }

  estimateCostUsd(model: string, usage: TokenUsage): number | null {
    return estimateOpenAICostUsd(model, usage);
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new AIProviderError("NOT_CONFIGURED", "OpenAI isn't configured", {
        provider: this.name,
      });
    }

    const maxAttempts = (request.maxRetries ?? this.config.maxRetries) + 1;
    let usage = emptyUsage();
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const result = await this.attempt(apiKey, request);
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

  private async attempt<T>(
    apiKey: string,
    request: StructuredGenerationRequest<T>,
  ): Promise<Omit<StructuredGenerationResult<T>, "attempts">> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/+$/, "")}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          max_output_tokens: request.maxOutputTokens,
          // Don't retain prompts and outputs on the provider side.
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: request.schema.name,
              schema: request.schema.jsonSchema,
              strict: true,
            },
          },
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? this.config.timeoutMs),
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

    const requestId = response.headers.get("x-request-id");
    const payload = await readJson(response);
    if (!response.ok) throw this.httpError(response, payload, requestId);

    const body: Record<string, unknown> = isRecord(payload) ? payload : {};
    const usage = parseUsage(body.usage);
    const model = typeof body.model === "string" && body.model ? body.model : request.model;
    const fail = (kind: AIErrorKindValue, message: string, retryable = false) =>
      new AIProviderError(kind, message, { provider: this.name, retryable, usage, requestId });

    if (body.status === "incomplete") {
      const reason = isRecord(body.incomplete_details) ? body.incomplete_details.reason : undefined;
      throw reason === "content_filter"
        ? fail("REFUSED", "The AI provider's content filter blocked the response")
        : fail("INCOMPLETE", "The AI response was cut off before it finished");
    }
    if (body.status === "failed") {
      throw fail("PROVIDER_ERROR", "The AI provider failed to generate a response", true);
    }

    const { text, refusal } = extractContent(body.output);
    if (refusal !== null) throw fail("REFUSED", "The AI declined this request");
    if (!text.trim()) throw fail("INVALID_OUTPUT", "The AI returned an empty response", true);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw fail("INVALID_OUTPUT", "The AI returned malformed JSON", true);
    }
    let data: T;
    try {
      data = request.schema.parse(parsed);
    } catch {
      throw fail("INVALID_OUTPUT", "The AI response didn't match the expected format", true);
    }
    return { data, model, usage, requestId };
  }

  private httpError(response: Response, payload: unknown, requestId: string | null) {
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
    if (status === 429 && code && QUOTA_ERROR_CODES.has(code)) {
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
}
