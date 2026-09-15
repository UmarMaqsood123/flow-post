import { env } from "../../config/env";
import { AIProviderError } from "./errors";
import { OPENAI_DEFAULT_MODEL, OpenAIProvider } from "./openai.provider";
import type { AIProvider } from "./types";

const disabledProvider: AIProvider = {
  name: "none",
  defaultModel: "none",
  isAvailable: () => false,
  generateStructured: () =>
    Promise.reject(
      new AIProviderError("NOT_CONFIGURED", "AI features are disabled", { provider: "none" }),
    ),
  estimateCostUsd: () => null,
};

/** Add a case here to support another provider (e.g. Anthropic, Azure OpenAI). */
const createProvider = (): AIProvider => {
  switch (env.AI_PROVIDER) {
    case "openai":
      return new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        defaultModel: env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL,
        timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
        maxRetries: env.AI_MAX_RETRIES,
      });
    case "none":
      return disabledProvider;
  }
};

let activeProvider: AIProvider | null = null;

export const getAIProvider = (): AIProvider => {
  activeProvider ??= createProvider();
  return activeProvider;
};

/** Replaces the provider (tests). Returns a function that restores the previous one. */
export const setAIProvider = (provider: AIProvider): (() => void) => {
  const previous = activeProvider;
  activeProvider = provider;
  return () => {
    activeProvider = previous;
  };
};
