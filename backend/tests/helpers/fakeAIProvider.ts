import { estimateOpenAICostUsd } from "../../src/integrations/ai/pricing";
import type {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "../../src/integrations/ai/types";

export const FAKE_USAGE = { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200 };

/** Returns canned output (parsed with the request's schema, like a real provider) and records requests. */
export class FakeAIProvider implements AIProvider {
  readonly name = "fake";
  readonly defaultModel = "gpt-5.6-terra";
  available = true;
  failWith: Error | null = null;
  requests: StructuredGenerationRequest<unknown>[] = [];
  private readonly respond: (request: StructuredGenerationRequest<unknown>) => unknown;

  constructor(respond: (request: StructuredGenerationRequest<unknown>) => unknown) {
    this.respond = respond;
  }

  isAvailable() {
    return this.available;
  }

  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const recorded = request as StructuredGenerationRequest<unknown>;
    this.requests.push(recorded);
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve({
      data: request.schema.parse(this.respond(recorded)),
      model: "gpt-5.6-terra-2026-08-01",
      usage: FAKE_USAGE,
      attempts: 1,
      requestId: "req_123",
    });
  }

  estimateCostUsd = estimateOpenAICostUsd;
}
