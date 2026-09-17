import type { Types } from "mongoose";
import type { ZodType } from "zod";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  type AIOperationValue,
  AIUsageStatus,
  type AIUsageStatusValue,
} from "../constants/ai.constant";
import type { SocialPlatformValue } from "../constants/brandProfile.constant";
import { ErrorCode, type ErrorCodeValue, HttpStatus } from "../constants/http.constant";
import { type AIErrorKindValue, AIProviderError } from "../integrations/ai/errors";
import {
  comparableText,
  type CreatePostsPromptInput,
  preparePostContent,
  type RefinePostPromptInput,
} from "../integrations/ai/postContent";
import {
  applyStyleRules,
  characterCount,
  findBuzzwords,
  normalizeHashtags,
  normalizeStrategyContent,
} from "../integrations/ai/postprocess";
import {
  type AutopilotTopicPromptInput,
  type PerformanceInsightsPromptInput,
  PROMPTS,
  type PromptTemplate,
} from "../integrations/ai/prompts";
import type { IPerformanceFact } from "../models/performanceInsightReport.model";
import type { PerformanceInsightsOutput } from "../validators/insights.validator";
import { type BrandContext, buildBrandContext } from "../integrations/ai/prompts/brandContext";
import { PLATFORM_GUIDELINES } from "../integrations/ai/prompts/platforms";
import { getAIProvider } from "../integrations/ai/registry";
import type { TokenUsage } from "../integrations/ai/types";
import { AIUsage } from "../models/aiUsage.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import type {
  AdaptForPlatformInput,
  ContentIdeasInput,
  ContentStrategyInput,
  GenerateCtaInput,
  GenerateHashtagsInput,
  GenerateHookInput,
  GeneratePostInput,
  RewritePostInput,
} from "../validators/ai.validator";
import { strategyContentSchema } from "../validators/contentStrategy.validator";
import { postContentSchema } from "../validators/post.validator";
import * as BrandProfileService from "./brandProfile.service";
import * as EntitlementService from "./entitlement.service";

const DAY_MS = 86_400_000;

export interface AIResult<T> {
  operation: AIOperationValue;
  provider: string;
  promptVersion: string;
  model: string;
  data: T;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
  brandProfileComplete: boolean;
  warnings: string[];
}

// ── Errors ─────────────────────────────────────────────────

const AI_ERROR_RESPONSES: Record<
  AIErrorKindValue,
  { status: number; code: ErrorCodeValue; message: string }
> = {
  NOT_CONFIGURED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: ErrorCode.AI_NOT_CONFIGURED,
    message: "AI features aren't configured on this server.",
  },
  AUTHENTICATION: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: ErrorCode.AI_NOT_CONFIGURED,
    message: "AI features are temporarily unavailable.",
  },
  MODEL_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: ErrorCode.AI_NOT_CONFIGURED,
    message: "AI features are temporarily unavailable.",
  },
  QUOTA_EXCEEDED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: ErrorCode.AI_QUOTA_EXCEEDED,
    message: "AI usage is temporarily unavailable.",
  },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    code: ErrorCode.RATE_LIMITED,
    message: "The AI service is busy. Please try again in a moment.",
  },
  TIMEOUT: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    code: ErrorCode.AI_TIMEOUT,
    message: "The AI took too long to respond. Please try again.",
  },
  REFUSED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: ErrorCode.AI_REFUSED,
    message: "The AI couldn't help with this request. Try rephrasing it.",
  },
  INCOMPLETE: {
    status: HttpStatus.BAD_GATEWAY,
    code: ErrorCode.AI_INCOMPLETE,
    message: "The AI response was cut off. Try a shorter or simpler request.",
  },
  INVALID_OUTPUT: {
    status: HttpStatus.BAD_GATEWAY,
    code: ErrorCode.AI_INVALID_OUTPUT,
    message: "The AI returned an unexpected response. Please try again.",
  },
  INVALID_REQUEST: {
    status: HttpStatus.BAD_GATEWAY,
    code: ErrorCode.AI_PROVIDER_ERROR,
    message: "The AI service couldn't process this request.",
  },
  PROVIDER_ERROR: {
    status: HttpStatus.BAD_GATEWAY,
    code: ErrorCode.AI_PROVIDER_ERROR,
    message: "The AI service had a problem. Please try again.",
  },
};

/** Configuration and billing problems need an operator, not the user. */
const OPERATOR_ERRORS = new Set<AIErrorKindValue>([
  "AUTHENTICATION",
  "MODEL_UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "INVALID_REQUEST",
]);

const toAppError = (error: AIProviderError) => {
  const { status, code, message } = AI_ERROR_RESPONSES[error.kind];
  return new AppError(message, status, { code, isOperational: true, cause: error });
};

// ── Usage tracking ─────────────────────────────────────────

interface UsageEntry {
  context: WorkspaceContext;
  operation: AIOperationValue;
  promptVersion: string;
  provider: string;
  model: string;
  usage: TokenUsage;
  estimatedCostUsd: number | null;
  status: AIUsageStatusValue;
  errorCode: string | null;
  startedAt: number;
  attempts: number;
  requestId: string | null;
}

/** Never lets a tracking failure break the request. */
const recordUsage = async (entry: UsageEntry) => {
  try {
    await AIUsage.create({
      workspace: entry.context.workspace._id,
      user: entry.context.user._id,
      operation: entry.operation,
      provider: entry.provider,
      model: entry.model,
      promptVersion: entry.promptVersion,
      inputTokens: entry.usage.inputTokens,
      outputTokens: entry.usage.outputTokens,
      cachedInputTokens: entry.usage.cachedInputTokens,
      estimatedCostUsd: entry.estimatedCostUsd,
      status: entry.status,
      errorCode: entry.errorCode,
      durationMs: Date.now() - entry.startedAt,
      attempts: entry.attempts,
      providerRequestId: entry.requestId,
    });
  } catch (error) {
    logger.error({ err: error, operation: entry.operation }, "Failed to record AI usage");
  }
};

// ── Core ───────────────────────────────────────────────────

interface Finalized<T> {
  data: T;
  warnings?: string[];
}

/** Loads brand context, calls the provider with the operation's prompt, post-processes and records usage. */
const run = async <Input, Output, Result>(
  context: WorkspaceContext,
  template: PromptTemplate<Input, Output>,
  input: Input,
  finalize: (output: Output, brand: BrandContext) => Finalized<Result>,
): Promise<AIResult<Result>> => {
  const provider = getAIProvider();
  if (!provider.isAvailable()) {
    throw toAppError(
      new AIProviderError("NOT_CONFIGURED", "AI isn't configured", { provider: provider.name }),
    );
  }

  // Counted per billing period across every workspace the billing owner pays for.
  await EntitlementService.assertCanGenerateAI(context.workspace);

  const brand = buildBrandContext(await BrandProfileService.getBrandProfile(context));
  const model = provider.defaultModel;
  const startedAt = Date.now();
  const base = {
    context,
    operation: template.operation,
    promptVersion: template.version,
    provider: provider.name,
    startedAt,
  };

  let result;
  try {
    result = await provider.generateStructured({
      model,
      instructions: template.instructions,
      input: template.buildInput(input, brand),
      schema: template.schema,
      maxOutputTokens: Math.min(template.maxOutputTokens, env.AI_MAX_OUTPUT_TOKENS),
      timeoutMs: template.timeoutMs,
      maxRetries: template.maxRetries,
    });
  } catch (error) {
    const failure =
      error instanceof AIProviderError
        ? error
        : new AIProviderError("PROVIDER_ERROR", "Unexpected AI error", {
            provider: provider.name,
            cause: error,
          });
    await recordUsage({
      ...base,
      model,
      usage: failure.usage,
      estimatedCostUsd: provider.estimateCostUsd(model, failure.usage),
      status: AIUsageStatus.FAILURE,
      errorCode: failure.kind,
      attempts: failure.attempts,
      requestId: failure.requestId,
    });
    const log = OPERATOR_ERRORS.has(failure.kind)
      ? logger.error.bind(logger)
      : logger.warn.bind(logger);
    log(
      {
        err: failure,
        kind: failure.kind,
        status: failure.status,
        detail: failure.detail,
        requestId: failure.requestId,
        attempts: failure.attempts,
        operation: template.operation,
        workspaceId: context.workspace.id,
      },
      "AI request failed",
    );
    throw toAppError(failure);
  }

  const estimatedCostUsd = provider.estimateCostUsd(result.model, result.usage);
  await recordUsage({
    ...base,
    model: result.model,
    usage: result.usage,
    estimatedCostUsd,
    status: AIUsageStatus.SUCCESS,
    errorCode: null,
    attempts: result.attempts,
    requestId: result.requestId,
  });

  // The style rules are part of every prompt, but models slip, so the
  // mechanical parts of them are enforced on the way out.
  const { data, warnings = [] } = finalize(applyStyleRules(result.data), brand);
  if (!brand.complete) {
    warnings.unshift("The brand profile isn't complete, so results may be generic.");
  }
  return {
    operation: template.operation,
    provider: provider.name,
    promptVersion: template.version,
    model: result.model,
    data,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostUsd,
    },
    brandProfileComplete: brand.complete,
    warnings,
  };
};

// ── Post-processing helpers ───────────────────────────────

const lengthWarning = (platform: SocialPlatformValue, text: string) => {
  const { label, maxCharacters } = PLATFORM_GUIDELINES[platform];
  const length = characterCount(text);
  return length > maxCharacters
    ? `The ${label} version is ${length.toLocaleString("en-US")} characters; the limit is ${maxCharacters.toLocaleString("en-US")}.`
    : null;
};

/** Buzzwords aren't rewritten automatically, since swapping them changes meaning. */
const buzzwordWarning = (platform: SocialPlatformValue, content: unknown) => {
  const found = findBuzzwords(JSON.stringify(content));
  return found.length > 0
    ? `The ${PLATFORM_GUIDELINES[platform].label} version uses ${found.map((word) => `"${word}"`).join(", ")}. Rewrite or regenerate it if you want that out.`
    : null;
};

const warningsOf = (...warnings: (string | null)[]) =>
  warnings.filter((warning): warning is string => Boolean(warning));

/**
 * Runs AI output through the same schema that validates people's edits. Nothing
 * reaches the database that a user couldn't have typed.
 */
const validateAIOutput = <T>(
  schema: ZodType<T>,
  value: unknown,
  context: WorkspaceContext,
  what: string,
): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    logger.warn(
      {
        issues: parsed.error.issues.slice(0, 10).map(({ path, message }) => ({ path, message })),
        workspaceId: context.workspace.id,
      },
      "AI output failed validation",
    );
    throw new AppError(
      `The AI returned ${what} that didn't pass validation. Please try again.`,
      HttpStatus.BAD_GATEWAY,
      { code: ErrorCode.AI_INVALID_OUTPUT, isOperational: true },
    );
  }
  return parsed.data;
};

// ── Operations ─────────────────────────────────────────────

export const generateContentStrategy = (
  context: WorkspaceContext,
  input: ContentStrategyInput & { insights?: string | null },
) =>
  run(context, PROMPTS.CONTENT_STRATEGY, input, (output) => ({
    data: validateAIOutput(
      strategyContentSchema,
      normalizeStrategyContent(output),
      context,
      "a strategy",
    ),
  }));

export const generateContentIdeas = (context: WorkspaceContext, input: ContentIdeasInput) =>
  run(context, PROMPTS.CONTENT_IDEAS, input, (output) => ({
    data: { ideas: output.ideas.slice(0, input.count) },
  }));

export const generatePost = (context: WorkspaceContext, input: GeneratePostInput) =>
  run(context, PROMPTS.GENERATE_POST, input, (output) => ({
    data: {
      platform: input.platform,
      text: output.text,
      hook: output.hook,
      cta: input.includeCta ? output.cta : null,
      hashtags: input.includeHashtags ? normalizeHashtags(output.hashtags) : [],
      imageSuggestion: output.imageSuggestion,
      characterCount: characterCount(output.text),
    },
    warnings: warningsOf(lengthWarning(input.platform, output.text)),
  }));

export const rewritePost = (context: WorkspaceContext, input: RewritePostInput) =>
  run(context, PROMPTS.REWRITE_POST, input, (output) => ({
    data: {
      text: output.text,
      summaryOfChanges: output.summaryOfChanges,
      characterCount: characterCount(output.text),
    },
    warnings: warningsOf(input.platform ? lengthWarning(input.platform, output.text) : null),
  }));

export const generateHashtags = (context: WorkspaceContext, input: GenerateHashtagsInput) =>
  run(context, PROMPTS.HASHTAGS, input, (output) => {
    const seen = new Set<string>();
    const hashtags = output.hashtags.flatMap(({ tag, category }) => {
      const [normalized] = normalizeHashtags([tag], 1);
      if (!normalized || seen.has(normalized.toLocaleLowerCase())) return [];
      seen.add(normalized.toLocaleLowerCase());
      return [{ tag: normalized, category }];
    });
    return { data: { hashtags: hashtags.slice(0, input.count) } };
  });

export const generateHook = (context: WorkspaceContext, input: GenerateHookInput) =>
  run(context, PROMPTS.HOOK, input, (output) => ({
    data: { hooks: output.hooks.slice(0, input.count) },
  }));

export const generateCTA = (context: WorkspaceContext, input: GenerateCtaInput) =>
  run(context, PROMPTS.CTA, input, (output) => ({
    data: { ctas: output.ctas.slice(0, input.count) },
  }));

export const adaptForPlatform = (context: WorkspaceContext, input: AdaptForPlatformInput) =>
  run(context, PROMPTS.ADAPT_FOR_PLATFORM, input, (output) => {
    const warnings: string[] = [];
    const adaptations = input.targetPlatforms.flatMap((platform) => {
      const adaptation = output.adaptations.find((item) => item.platform === platform);
      if (!adaptation) {
        warnings.push(`No ${PLATFORM_GUIDELINES[platform].label} version was generated.`);
        return [];
      }
      const warning = lengthWarning(platform, adaptation.text);
      if (warning) warnings.push(warning);
      return [
        {
          ...adaptation,
          hashtags: normalizeHashtags(adaptation.hashtags),
          characterCount: characterCount(adaptation.text),
        },
      ];
    });
    return { data: { adaptations }, warnings };
  });

/**
 * Writes every requested platform in one request, so the model can deliberately
 * make each version different. Near-identical drafts are flagged as a warning.
 */
export const createPosts = (context: WorkspaceContext, input: CreatePostsPromptInput) =>
  run(context, PROMPTS.CREATE_POSTS, input, (output) => {
    const warnings: string[] = [];
    const drafts = input.platforms.flatMap((platform) => {
      const draft = output.drafts.find((item) => item.platform === platform);
      if (!draft) {
        warnings.push(`No ${PLATFORM_GUIDELINES[platform].label} version was written.`);
        return [];
      }
      const { platform: _platform, ...content } = draft;
      const prepared = validateAIOutput(
        postContentSchema,
        preparePostContent(platform, content),
        context,
        "a post",
      );
      warnings.push(
        ...warningsOf(lengthWarning(platform, prepared.text), buzzwordWarning(platform, prepared)),
      );
      return [{ platform, content: prepared }];
    });

    for (let i = 0; i < drafts.length; i += 1) {
      for (let j = i + 1; j < drafts.length; j += 1) {
        if (comparableText(drafts[i].content.text) === comparableText(drafts[j].content.text)) {
          warnings.push(
            `The ${PLATFORM_GUIDELINES[drafts[i].platform].label} and ${PLATFORM_GUIDELINES[drafts[j].platform].label} versions came out almost identical. Regenerate one of them.`,
          );
        }
      }
    }
    return { data: { drafts }, warnings };
  });

export interface CheckedInsight {
  category: PerformanceInsightsOutput["insights"][number]["category"];
  title: string;
  interpretation: string;
  recommendation: string;
  factIds: string[];
}

/**
 * Why an AI insight breaks the rules, or null when it's usable. The rules are
 * what keep calculated metrics and AI interpretation apart:
 * - no digits anywhere, so every number a person sees is a calculated one;
 * - every cited fact exists and belongs to the insight's category;
 * - it isn't resting only on facts with too few posts to mean anything.
 */
export const insightProblem = (
  insight: PerformanceInsightsOutput["insights"][number],
  facts: Map<string, IPerformanceFact>,
): string | null => {
  if (
    [insight.title, insight.interpretation, insight.recommendation].some((text) => /\d/.test(text))
  ) {
    return "contains a number the AI wrote itself";
  }
  if (!insight.title.trim() || !insight.interpretation.trim() || !insight.recommendation.trim()) {
    return "is missing its text";
  }
  const cited = insight.factIds.map((id) => facts.get(id));
  if (cited.some((fact) => !fact)) return "cites a fact that doesn't exist";
  if (cited.some((fact) => fact!.category !== insight.category)) {
    return "cites facts from another category";
  }
  if (cited.every((fact) => fact!.confidence === "LOW")) {
    return "rests only on facts with too few posts";
  }
  return null;
};

/**
 * Reads calculated performance facts and writes interpretation and advice.
 * Insights that break the rules are dropped here, before anything is stored,
 * and counted so the report can say how many were thrown away.
 */
export const generatePerformanceInsights = (
  context: WorkspaceContext,
  input: PerformanceInsightsPromptInput,
) =>
  run(context, PROMPTS.PERFORMANCE_INSIGHTS, input, (output) => {
    const facts = new Map(input.facts.map((fact) => [fact.id, fact]));
    const accepted: CheckedInsight[] = [];
    let rejected = 0;
    for (const insight of output.insights) {
      const problem = insightProblem(insight, facts);
      if (problem) {
        rejected += 1;
        logger.warn(
          { workspaceId: context.workspace.id, category: insight.category, problem },
          "AI insight rejected",
        );
        continue;
      }
      accepted.push({
        category: insight.category,
        title: insight.title.trim(),
        interpretation: insight.interpretation.trim(),
        recommendation: insight.recommendation.trim(),
        factIds: [...new Set(insight.factIds)],
      });
    }
    return { data: { insights: accepted, rejected } };
  });

/** Topic candidates for Autopilot, trimmed and without repeats among themselves. */
export const selectAutopilotTopics = (
  context: WorkspaceContext,
  input: AutopilotTopicPromptInput,
) =>
  run(context, PROMPTS.AUTOPILOT_TOPIC, input, (output) => {
    const seen = new Set<string>();
    const topics = output.topics.flatMap(({ topic, angle }) => {
      const trimmed = topic.trim();
      const key = comparableText(trimmed);
      if (!trimmed || seen.has(key)) return [];
      seen.add(key);
      return [{ topic: trimmed, angle: angle.trim() }];
    });
    return { data: { topics } };
  });

/** Applies one change (shorten, expand, change tone, improve hook or CTA, emoji, hashtags). */
export const refinePostContent = (context: WorkspaceContext, input: RefinePostPromptInput) =>
  run(context, PROMPTS.REFINE_POST, input, (output) => {
    const content = validateAIOutput(
      postContentSchema,
      preparePostContent(input.platform, output),
      context,
      "a post",
    );
    return {
      data: content,
      warnings: warningsOf(
        lengthWarning(input.platform, content.text),
        buzzwordWarning(input.platform, content),
      ),
    };
  });

// ── Reporting ──────────────────────────────────────────────

interface UsageTotals {
  requests: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

const emptyTotals = (): UsageTotals => ({
  requests: 0,
  failures: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostUsd: 0,
});

const roundCost = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export const getUsageSummary = async (workspaceId: Types.ObjectId, days: number) => {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await AIUsage.aggregate<{
    _id: { operation: AIOperationValue; status: AIUsageStatusValue };
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }>([
    // Always match the workspace first (aggregations bypass the workspace-scope guard).
    { $match: { workspace: workspaceId, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { operation: "$operation", status: "$status" },
        requests: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        estimatedCostUsd: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
      },
    },
  ]);

  const totals = emptyTotals();
  const byOperation: Partial<Record<AIOperationValue, UsageTotals>> = {};
  for (const row of rows) {
    const operationTotals = (byOperation[row._id.operation] ??= emptyTotals());
    for (const target of [totals, operationTotals]) {
      target.requests += row.requests;
      if (row._id.status === AIUsageStatus.FAILURE) target.failures += row.requests;
      target.inputTokens += row.inputTokens;
      target.outputTokens += row.outputTokens;
      target.estimatedCostUsd = roundCost(target.estimatedCostUsd + row.estimatedCostUsd);
    }
  }
  return { since, days, totals, byOperation };
};

export const deleteWorkspaceAIUsage = async (workspaceId: Types.ObjectId): Promise<void> => {
  await AIUsage.deleteMany({ workspace: workspaceId });
};
