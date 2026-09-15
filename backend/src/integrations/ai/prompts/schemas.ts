import { z } from "zod";
import { BRAND_GOALS, SOCIAL_PLATFORMS } from "../../../constants/brandProfile.constant";
import { HASHTAG_CATEGORIES, HOOK_STYLES, POST_FORMATS } from "../../../constants/ai.constant";
import {
  type StrategyContent,
  strategyContentOutputSchema,
} from "../../../validators/contentStrategy.validator";

/**
 * Structured-output schemas. Rules for strict mode: no `.optional()` (use
 * `.nullable()`). Transforms may only clean values; the JSON schema is built from
 * each schema's input side. Post-processing happens in ai.service.ts.
 */

const platform = z.enum(SOCIAL_PLATFORMS);

/** Shared with stored strategies and the strategy editor (validators/contentStrategy.validator.ts). */
export const contentStrategyOutputSchema = strategyContentOutputSchema;

export const contentIdeasOutputSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      format: z.enum(POST_FORMATS),
      platform,
      hook: z.string(),
      whyItWorks: z.string(),
    }),
  ),
});

export const generatePostOutputSchema = z.object({
  text: z.string(),
  hook: z.string(),
  cta: z.string().nullable(),
  hashtags: z.array(z.string()),
  imageSuggestion: z.string().nullable(),
});

export const rewritePostOutputSchema = z.object({
  text: z.string(),
  summaryOfChanges: z.array(z.string()),
});

export const hashtagsOutputSchema = z.object({
  hashtags: z.array(z.object({ tag: z.string(), category: z.enum(HASHTAG_CATEGORIES) })),
});

export const hooksOutputSchema = z.object({
  hooks: z.array(z.object({ text: z.string(), style: z.enum(HOOK_STYLES) })),
});

export const ctasOutputSchema = z.object({
  ctas: z.array(z.object({ text: z.string(), intent: z.enum(BRAND_GOALS) })),
});

export const adaptationsOutputSchema = z.object({
  adaptations: z.array(
    z.object({
      platform,
      text: z.string(),
      hashtags: z.array(z.string()),
      notes: z.string(),
    }),
  ),
});

export type ContentStrategyOutput = StrategyContent;
export type ContentIdeasOutput = z.infer<typeof contentIdeasOutputSchema>;
export type GeneratePostOutput = z.infer<typeof generatePostOutputSchema>;
export type RewritePostOutput = z.infer<typeof rewritePostOutputSchema>;
export type HashtagsOutput = z.infer<typeof hashtagsOutputSchema>;
export type HooksOutput = z.infer<typeof hooksOutputSchema>;
export type CtasOutput = z.infer<typeof ctasOutputSchema>;
export type AdaptationsOutput = z.infer<typeof adaptationsOutputSchema>;
