import { isRecord } from "../social/http";
import { AIProviderError, type AIErrorKindValue } from "./errors";
import { BaseHttpAIProvider, type HttpProviderConfig, tokenCount } from "./httpProvider";
import { estimateOpenAICostUsd } from "./pricing";
import type { StructuredGenerationRequest, StructuredGenerationResult, TokenUsage } from "./types";

/** Used when OPENAI_MODEL isn't set. Check it's available to your account. */
export const OPENAI_DEFAULT_MODEL = "gpt-5.6-terra";

export type OpenAIProviderConfig = HttpProviderConfig;

const parseUsage = (value: unknown): TokenUsage => {
  if (!isRecord(value)) return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const details = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  return {
    inputTokens: tokenCount(value.input_tokens),
    outputTokens: tokenCount(value.output_tokens),
    cachedInputTokens: tokenCount(details.cached_tokens),
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

/**
 * OpenAI via the Responses API with strict JSON-schema structured outputs.
 * Plain fetch keeps the provider small, dependency-free and testable with a fake fetch.
 */
export class OpenAIProvider extends BaseHttpAIProvider {
  readonly name = "openai";

  estimateCostUsd(model: string, usage: TokenUsage): number | null {
    return estimateOpenAICostUsd(model, usage);
  }

  protected missingConfigMessage(): string | null {
    return this.config.apiKey ? null : "OpenAI isn't configured";
  }

  protected async attempt<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<Omit<StructuredGenerationResult<T>, "attempts">> {
    const response = await this.post(
      "/responses",
      {
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

    return { data: this.parseOutput(text, request, fail), model, usage, requestId };
  }
}
