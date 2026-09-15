import type { TokenUsage } from "./types";

interface ModelPrice {
  /** USD per 1M tokens. */
  input: number;
  cachedInput: number;
  output: number;
}

/**
 * OpenAI standard-tier text prices, USD per 1M tokens.
 * Source: https://developers.openai.com/api/docs/pricing (checked 2026-09-15).
 * Estimates only — invoices are authoritative. Update this table when prices change;
 * models missing here record `estimatedCostUsd: null`.
 */
export const OPENAI_PRICING: Record<string, ModelPrice> = {
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

/** Responses report snapshot ids like `gpt-5.6-terra-2026-08-01`; price them as the base model. */
const priceFor = (model: string): ModelPrice | undefined =>
  OPENAI_PRICING[model] ?? OPENAI_PRICING[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];

export const estimateOpenAICostUsd = (model: string, usage: TokenUsage): number | null => {
  const price = priceFor(model);
  if (!price) return null;
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const cost =
    ((usage.inputTokens - cached) * price.input +
      cached * price.cachedInput +
      usage.outputTokens * price.output) /
    1_000_000;
  // Micro-dollar precision keeps sums stable.
  return Math.round(cost * 1_000_000) / 1_000_000;
};
