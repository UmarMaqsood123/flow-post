import { z } from "zod";
import {
  POST_FORMATS,
  POST_LENGTHS,
  REWRITE_LENGTHS,
  STRATEGY_TIMEFRAMES,
} from "../constants/ai.constant";
import { BRAND_GOALS, BRAND_TONES, SOCIAL_PLATFORMS } from "../constants/brandProfile.constant";

const platform = z.enum(SOCIAL_PLATFORMS, { error: "Choose a supported platform" });

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max.toLocaleString("en-US")} characters`);

/** Blank strings become undefined. */
const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max.toLocaleString("en-US")} characters`)
    .optional()
    .transform((value) => value || undefined);

const count = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max, `Ask for at most ${max}`).default(fallback);

const uniquePlatforms = (max: number) =>
  z
    .array(platform)
    .max(max)
    .transform((values) => [...new Set(values)]);

/** Either post text or a topic must be given. */
const textOrTopic = {
  text: optionalText("Post text", 10_000),
  topic: optionalText("Topic", 500),
};
const requireTextOrTopic = <T extends { text?: string; topic?: string }>(input: T) =>
  Boolean(input.text || input.topic);
const textOrTopicMessage = { message: "Provide post text or a topic", path: ["topic"] };

export const contentStrategyInputSchema = z.object({
  timeframe: z.enum(STRATEGY_TIMEFRAMES).default("MONTH"),
  platforms: uniquePlatforms(8).optional(),
  focus: optionalText("Focus", 500),
  /** What to change compared with a previous version. */
  instructions: optionalText("Instructions", 500),
});

export const contentIdeasInputSchema = z.object({
  count: count(15, 5),
  platform: platform.optional(),
  topic: optionalText("Topic", 500),
  format: z.enum(POST_FORMATS).optional(),
});

export const generatePostInputSchema = z.object({
  platform,
  topic: requiredText("Topic", 500),
  format: z.enum(POST_FORMATS).default("TEXT"),
  length: z.enum(POST_LENGTHS).default("MEDIUM"),
  keyPoints: z.array(requiredText("Key point", 300)).max(10).default([]),
  includeHashtags: z.boolean().default(true),
  includeCta: z.boolean().default(true),
});

export const rewritePostInputSchema = z.object({
  text: requiredText("Post text", 10_000),
  platform: platform.optional(),
  tone: z.enum(BRAND_TONES).optional(),
  length: z.enum(REWRITE_LENGTHS).default("SAME"),
  instructions: optionalText("Instructions", 500),
});

export const generateHashtagsInputSchema = z
  .object({ ...textOrTopic, platform, count: count(30, 10) })
  .refine(requireTextOrTopic, textOrTopicMessage);

export const generateHookInputSchema = z
  .object({ ...textOrTopic, platform, count: count(10, 3) })
  .refine(requireTextOrTopic, textOrTopicMessage);

export const generateCtaInputSchema = z
  .object({ ...textOrTopic, platform, goal: z.enum(BRAND_GOALS).optional(), count: count(10, 3) })
  .refine(requireTextOrTopic, textOrTopicMessage);

export const adaptForPlatformInputSchema = z.object({
  text: requiredText("Post text", 10_000),
  sourcePlatform: platform.optional(),
  targetPlatforms: uniquePlatforms(8).refine((values) => values.length > 0, {
    message: "Choose at least one platform",
  }),
});

export const aiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type ContentStrategyInput = z.infer<typeof contentStrategyInputSchema>;
export type ContentIdeasInput = z.infer<typeof contentIdeasInputSchema>;
export type GeneratePostInput = z.infer<typeof generatePostInputSchema>;
export type RewritePostInput = z.infer<typeof rewritePostInputSchema>;
export type GenerateHashtagsInput = z.infer<typeof generateHashtagsInputSchema>;
export type GenerateHookInput = z.infer<typeof generateHookInputSchema>;
export type GenerateCtaInput = z.infer<typeof generateCtaInputSchema>;
export type AdaptForPlatformInput = z.infer<typeof adaptForPlatformInputSchema>;
export type AIUsageQuery = z.infer<typeof aiUsageQuerySchema>;
