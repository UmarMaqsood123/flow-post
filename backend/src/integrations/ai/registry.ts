import { env } from "../../config/env";
import { AIProviderError } from "./errors";
import { OPENAI_DEFAULT_MODEL, OpenAIProvider } from "./openai.provider";
import { OpenAICompatibleProvider } from "./openaiCompatible.provider";
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

/** Add a case here to support another provider (e.g. Anthropic's own API). */
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
    // Any service that speaks OpenAI's Chat Completions API: Groq, Gemini's
    // compatibility endpoint, OpenRouter, Ollama, LM Studio…
    case "openai-compatible":
      return new OpenAICompatibleProvider({
        apiKey: env.AI_API_KEY,
        baseUrl: env.AI_BASE_URL ?? "",
        defaultModel: env.AI_MODEL ?? "",
        structuredMode: env.AI_STRUCTURED_MODE,
        label: env.AI_PROVIDER_LABEL,
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
