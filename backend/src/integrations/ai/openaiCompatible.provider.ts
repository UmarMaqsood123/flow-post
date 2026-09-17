import { isRecord } from "../social/http";
import { AIProviderError, type AIErrorKindValue } from "./errors";
import { BaseHttpAIProvider, type HttpProviderConfig, tokenCount } from "./httpProvider";
import type { StructuredGenerationRequest, StructuredGenerationResult, TokenUsage } from "./types";

/**
 * How the service is asked for JSON:
 * - "json_schema": the schema is enforced by the service (Groq's GPT-OSS models,
 *   Gemini, most OpenRouter models). Preferred.
 * - "json_object": the service only promises valid JSON, so the schema goes in
 *   the prompt instead. The reply is validated here either way.
 */
export type StructuredMode = "json_schema" | "json_object";

export interface OpenAICompatibleConfig extends HttpProviderConfig {
  structuredMode: StructuredMode;
  /** Shown in logs, e.g. "Groq". */
  label?: string;
}

const parseUsage = (value: unknown): TokenUsage => {
  if (!isRecord(value)) return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const details = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : {};
  return {
    inputTokens: tokenCount(value.prompt_tokens),
    outputTokens: tokenCount(value.completion_tokens),
    cachedInputTokens: tokenCount(details.cached_tokens),
  };
};

/** Some services answer with content parts instead of a plain string. */
const readContent = (message: Record<string, unknown>): string => {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("");
};

/** Models running on this machine don't need credentials; hosted services always do. */
const isLocalUrl = (url: string) => {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

/** Smaller models sometimes wrap JSON in a code fence even when asked not to. */
const stripCodeFence = (text: string) => {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return fenced ? fenced[1] : text;
};

/**
 * Any service that speaks OpenAI's Chat Completions API: Groq, Google's Gemini
 * compatibility endpoint, OpenRouter, Ollama, LM Studio, vLLM and friends.
 * One implementation, configured by base URL and model.
 */
export class OpenAICompatibleProvider extends BaseHttpAIProvider {
  readonly name: string;
  private readonly structuredMode: StructuredMode;

  constructor(config: OpenAICompatibleConfig) {
    super(config);
    this.name = config.label ?? "openai-compatible";
    this.structuredMode = config.structuredMode;
  }

  /** Local runtimes (Ollama, LM Studio) need no key; hosted services do. */
  override isAvailable(): boolean {
    return this.missingConfigMessage() === null;
  }

  /** Pricing varies per service and free tiers cost nothing, so usage records no estimate. */
  estimateCostUsd(): number | null {
    return null;
  }

  protected missingConfigMessage(): string | null {
    if (!this.config.baseUrl) return "AI_BASE_URL isn't set";
    if (!this.config.defaultModel) return "AI_MODEL isn't set";
    if (!this.config.apiKey && !isLocalUrl(this.config.baseUrl)) return "AI_API_KEY isn't set";
    return null;
  }

  protected async attempt<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<Omit<StructuredGenerationResult<T>, "attempts">> {
    const usesSchema = this.structuredMode === "json_schema";
    const instructions = usesSchema
      ? request.instructions
      : // Without server-side schema enforcement the shape has to be part of the prompt.
        `${request.instructions}\n\nReply with JSON only — no prose, no code fences — matching this JSON Schema exactly:\n${JSON.stringify(
          request.schema.jsonSchema,
        )}`;

    const response = await this.post(
      "/chat/completions",
      {
        model: request.model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: request.input },
        ],
        max_tokens: request.maxOutputTokens,
        response_format: usesSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: request.schema.name,
                schema: request.schema.jsonSchema,
                strict: true,
              },
            }
          : { type: "json_object" },
      },
      request.timeoutMs ?? this.config.timeoutMs,
    );

    const requestId = this.requestId(response);
    const body = await this.readBody(response);
    if (!response.ok) throw this.httpError(response, body, requestId);

    const usage = parseUsage(body.usage);
    const model = typeof body.model === "string" && body.model ? body.model : request.model;
    const fail = (kind: AIErrorKindValue, message: string, retryable = false) =>
      new AIProviderError(kind, message, { provider: this.name, retryable, usage, requestId });

    // Some services report failures with a 200 and an error body.
    if (isRecord(body.error)) {
      const message = typeof body.error.message === "string" ? body.error.message : "";
      throw new AIProviderError("PROVIDER_ERROR", "The AI provider returned an error", {
        provider: this.name,
        retryable: true,
        usage,
        requestId,
        detail: message.slice(0, 300),
      });
    }

    const choice =
      Array.isArray(body.choices) && isRecord(body.choices[0]) ? body.choices[0] : null;
    if (!choice) throw fail("INVALID_OUTPUT", "The AI returned no choices", true);

    const message = isRecord(choice.message) ? choice.message : {};
    if (typeof message.refusal === "string" && message.refusal) {
      throw fail("REFUSED", "The AI declined this request");
    }
    if (choice.finish_reason === "content_filter") {
      throw fail("REFUSED", "The AI provider's content filter blocked the response");
    }
    if (choice.finish_reason === "length") {
      throw fail("INCOMPLETE", "The AI response was cut off before it finished");
    }

    const text = stripCodeFence(readContent(message));
    return { data: this.parseOutput(text, request, fail), model, usage, requestId };
  }
}
