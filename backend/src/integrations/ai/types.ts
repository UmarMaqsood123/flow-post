/** Provider-neutral AI types. Features depend on these, never on a vendor SDK or API shape. */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Portion of inputTokens served from the provider's prompt cache (billed at a lower rate). */
  cachedInputTokens: number;
}

export const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
});

export const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
});

/** A JSON Schema the model must follow, plus a validator for what comes back. */
export interface StructuredOutputSchema<T> {
  /** Identifier sent to the provider (letters, digits, underscores). */
  name: string;
  jsonSchema: Record<string, unknown>;
  /** Throws when the value doesn't match. */
  parse: (value: unknown) => T;
}

export interface StructuredGenerationRequest<T> {
  model: string;
  /** System-level instructions (the versioned prompt). */
  instructions: string;
  /** The user-level content: brand data and the request. */
  input: string;
  schema: StructuredOutputSchema<T>;
  maxOutputTokens: number;
  /** Overrides the provider's per-attempt timeout. */
  timeoutMs?: number;
  /** Overrides the provider's retry count. */
  maxRetries?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  /** The model that actually served the request (may include a snapshot suffix). */
  model: string;
  /** Tokens billed across every attempt, including failed retries. */
  usage: TokenUsage;
  attempts: number;
  requestId: string | null;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  isAvailable(): boolean;
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>>;
  /** Estimated USD cost, or null when the model's price is unknown. */
  estimateCostUsd(model: string, usage: TokenUsage): number | null;
}
