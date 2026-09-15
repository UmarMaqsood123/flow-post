import { z } from "zod";
import { POST_FORMATS, STRATEGY_TIMEFRAMES } from "../constants/ai.constant";
import { BRAND_GOALS, SOCIAL_PLATFORMS } from "../constants/brandProfile.constant";
import { CONTENT_STRATEGY_LIMITS as LIMITS, WEEKDAYS } from "../constants/contentStrategy.constant";
import { normalizeHashtags } from "../integrations/ai/postprocess";
import { objectIdField } from "./common.validator";

/**
 * A strategy's content is defined once, in two modes:
 * - "input" validates edits from the strategy page, with clear messages and hard limits.
 * - "ai" is the structured-output schema sent to the model. Models can't be held to
 *   lengths and counts, so values are clipped instead of rejected. The result is then
 *   validated again in "input" mode before it's stored (see AIService).
 */
type Mode = "input" | "ai";

const formatNumber = (value: number) => value.toLocaleString("en-US");

const text = (mode: Mode, label: string, max: number, required = false): z.ZodType<string> => {
  if (mode === "ai") return z.string().transform((value) => value.trim().slice(0, max));
  const schema = z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${formatNumber(max)} characters`);
  return required ? schema.min(1, `${label} is required`) : schema;
};

const wholeNumber = (mode: Mode, label: string, max: number): z.ZodType<number> =>
  mode === "ai"
    ? z
        .number()
        .transform((value) =>
          Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0,
        )
    : z
        .number({ error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(0, `${label} can't be negative`)
        .max(max, `${label} must be at most ${formatNumber(max)}`);

interface ListOptions<T> {
  /** Items to drop (e.g. blank entries) in AI mode, and after validation in input mode. */
  keep?: (item: T) => boolean;
  /** Items must be unique by this key: rejected in input mode, de-duplicated in AI mode. */
  uniqueBy?: (item: T) => string;
  uniqueMessage?: string;
}

const list = <T>(
  mode: Mode,
  label: string,
  item: z.ZodType<T>,
  max: number,
  { keep, uniqueBy, uniqueMessage }: ListOptions<T> = {},
): z.ZodType<T[]> => {
  if (mode === "ai") {
    return z.array(item).transform((items) => {
      const seen = new Set<string>();
      return items
        .filter((value) => {
          if (keep && !keep(value)) return false;
          if (!uniqueBy) return true;
          const key = uniqueBy(value);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, max);
    });
  }
  return z
    .array(item, { error: `${label} must be a list` })
    .max(max, `Add up to ${max} ${label}`)
    .superRefine((items, ctx) => {
      if (!uniqueBy) return;
      const seen = new Set<string>();
      items.forEach((value, index) => {
        const key = uniqueBy(value);
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: uniqueMessage ?? `Each item in ${label} must be unique`,
          });
        }
        seen.add(key);
      });
    })
    .transform((items) => (keep ? items.filter(keep) : items));
};

const enumList = <T extends string>(
  mode: Mode,
  label: string,
  values: readonly [T, ...T[]],
  max: number,
): z.ZodType<T[]> => {
  const item = z.enum(values as unknown as [T, ...T[]], {
    error: `Choose from the available ${label}`,
  }) as unknown as z.ZodType<T>;
  const unique = (items: T[]) => [...new Set(items)];
  return mode === "ai"
    ? z.array(item).transform((items) => unique(items).slice(0, max))
    : z
        .array(item, { error: `${label} must be a list` })
        .max(max, `Choose up to ${max} ${label}`)
        .transform(unique);
};

const sectionShape = (mode: Mode) => {
  const platform = z.enum(SOCIAL_PLATFORMS, { error: "Choose a supported platform" });
  const format = z.enum(POST_FORMATS, { error: "Choose a supported format" });
  const goal = z.enum(BRAND_GOALS, { error: "Choose a goal" });
  const summary = (label: string) => text(mode, label, LIMITS.summary);
  const paragraph = (label: string) => text(mode, label, LIMITS.text);
  const notBlank = (value: string) => value.length > 0;
  const items = (label: string, itemLabel: string) =>
    list(mode, label, text(mode, itemLabel, LIMITS.item), LIMITS.items, { keep: notBlank });
  const hashtags = (label: string) =>
    list(mode, label, text(mode, "Hashtag", LIMITS.hashtag), LIMITS.hashtags).transform((tags) =>
      normalizeHashtags(tags, LIMITS.hashtags),
    );

  const hashtagApproach = z.object({
    summary: summary("Hashtag approach"),
    minPerPost: wholeNumber(mode, "Minimum hashtags per post", LIMITS.hashtagsPerPost),
    maxPerPost: wholeNumber(mode, "Maximum hashtags per post", LIMITS.hashtagsPerPost),
    branded: hashtags("branded hashtags"),
    community: hashtags("community hashtags"),
    niche: hashtags("niche hashtags"),
    guidelines: items("guidelines", "Guideline"),
  });

  const contentFormats = list(
    mode,
    "formats",
    z.object({
      format,
      sharePercent: wholeNumber(mode, "Share", 100),
      purpose: paragraph("Purpose"),
    }),
    LIMITS.formats,
    { uniqueBy: (item) => item.format, uniqueMessage: "Each format can only be listed once" },
  );

  return {
    audienceAnalysis: z.object({
      summary: summary("Audience summary"),
      segments: list(
        mode,
        "audience segments",
        z.object({
          name: text(mode, "Segment name", LIMITS.label, true),
          description: paragraph("Segment description"),
          painPoints: items("pain points", "Pain point"),
          motivations: items("motivations", "Motivation"),
          contentPreferences: items("content preferences", "Content preference"),
        }),
        LIMITS.segments,
        { keep: (segment) => segment.name.length > 0 },
      ),
    }),
    contentPillars: list(
      mode,
      "content pillars",
      z.object({
        name: text(mode, "Pillar name", LIMITS.label, true),
        description: paragraph("Pillar description"),
        objective: paragraph("Pillar objective"),
        exampleTopics: items("example topics", "Example topic"),
      }),
      LIMITS.pillars,
      { keep: (pillar) => pillar.name.length > 0 },
    ),
    recommendedTopics: list(
      mode,
      "topics",
      z.object({
        title: text(mode, "Topic", LIMITS.item, true),
        pillar: text(mode, "Pillar", LIMITS.label),
        angle: paragraph("Angle"),
        format,
        platforms: enumList(mode, "platforms", SOCIAL_PLATFORMS, LIMITS.platforms),
      }),
      LIMITS.topics,
      { keep: (topic) => topic.title.length > 0 },
    ),
    platformStrategy: list(
      mode,
      "platforms",
      z.object({
        platform,
        role: paragraph("Role"),
        audienceFit: paragraph("Audience fit"),
        contentFocus: paragraph("Content focus"),
        formats: enumList(mode, "formats", POST_FORMATS, LIMITS.formats),
      }),
      LIMITS.platforms,
      { uniqueBy: (item) => item.platform, uniqueMessage: "Each platform can only appear once" },
    ),
    brandTone: z.object({
      summary: summary("Tone summary"),
      voiceAttributes: list(
        mode,
        "voice attributes",
        text(mode, "Voice attribute", LIMITS.label),
        LIMITS.items,
        { keep: notBlank },
      ),
      dos: items("do's", "Do"),
      donts: items("don'ts", "Don't"),
      examplePhrases: items("example phrases", "Example phrase"),
    }),
    ctaStrategy: z.object({
      summary: summary("CTA strategy"),
      primaryGoal: goal,
      ctas: list(
        mode,
        "calls to action",
        z.object({
          text: text(mode, "Call to action", LIMITS.item, true),
          goal,
          placement: text(mode, "Placement", LIMITS.item),
        }),
        LIMITS.ctas,
        { keep: (cta) => cta.text.length > 0 },
      ),
    }),
    postingFrequency: z.object({
      summary: summary("Posting frequency"),
      postsPerWeek: wholeNumber(mode, "Posts per week", LIMITS.postsPerWeek),
      platforms: list(
        mode,
        "platform schedules",
        z.object({
          platform,
          postsPerWeek: wholeNumber(mode, "Posts per week", LIMITS.postsPerWeek),
          bestDays: enumList(mode, "days", WEEKDAYS, WEEKDAYS.length),
          timing: text(mode, "Timing", LIMITS.item),
        }),
        LIMITS.platforms,
        { uniqueBy: (item) => item.platform, uniqueMessage: "Each platform can only appear once" },
      ),
    }),
    contentFormats:
      mode === "ai"
        ? contentFormats
        : contentFormats.refine(
            (formats) =>
              formats.length === 0 ||
              formats.reduce((sum, item) => sum + item.sharePercent, 0) === 100,
            { message: "Format shares must add up to 100%" },
          ),
    hashtagApproach:
      mode === "ai"
        ? hashtagApproach
        : hashtagApproach.refine((value) => value.minPerPost <= value.maxPerPost, {
            message: "The maximum can't be lower than the minimum",
            path: ["maxPerPost"],
          }),
  };
};

/** Validates a complete strategy (every section). */
export const strategyContentSchema = z.object(sectionShape("input"));
export type StrategyContent = z.output<typeof strategyContentSchema>;

/** Structured output for the model. Its result is validated with strategyContentSchema before storing. */
export const strategyContentOutputSchema = z.object(
  sectionShape("ai"),
) as unknown as z.ZodType<StrategyContent>;

// ── Requests ───────────────────────────────────────────────

const platformList = z
  .array(z.enum(SOCIAL_PLATFORMS, { error: "Choose a supported platform" }))
  .max(SOCIAL_PLATFORMS.length)
  .transform((values) => [...new Set(values)]);

/** Blank strings become undefined. */
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${formatNumber(max)} characters`)
    .optional()
    .transform((value) => value || undefined);

export const contentStrategyParamsSchema = z.object({ strategyId: objectIdField });

export const generateContentStrategySchema = z.object({
  name: optionalText("Name", LIMITS.name),
  timeframe: z.enum(STRATEGY_TIMEFRAMES, { error: "Choose a timeframe" }).default("MONTH"),
  /** Defaults to the brand profile's preferred platforms. */
  platforms: platformList.optional(),
  focus: optionalText("Focus", LIMITS.instructions),
});

/** Omitted fields reuse the previous version's settings; an empty focus clears it. */
export const regenerateContentStrategySchema = z.object({
  timeframe: z.enum(STRATEGY_TIMEFRAMES, { error: "Choose a timeframe" }).optional(),
  platforms: platformList.optional(),
  focus: z
    .string({ error: "Focus must be text" })
    .trim()
    .max(
      LIMITS.instructions,
      `Focus must be at most ${formatNumber(LIMITS.instructions)} characters`,
    )
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null)),
  /** What to change compared with the previous version. */
  instructions: optionalText("Instructions", LIMITS.instructions),
});

export const updateContentStrategySchema = z
  .object({
    /** The revision the client last loaded; the save fails if someone changed it since. */
    revision: z.number({ error: "Reload the strategy and try again" }).int().min(0),
    name: z
      .string({ error: "Name must be text" })
      .trim()
      .max(LIMITS.name, `Name must be at most ${LIMITS.name} characters`)
      .nullable()
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
    /** Only the sections being saved; each is validated in full. */
    sections: z.object(sectionShape("input")).partial().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      Object.values(value.sections ?? {}).some((section) => section !== undefined),
    { message: "Nothing to save" },
  );

export type ContentStrategyParams = z.infer<typeof contentStrategyParamsSchema>;
export type GenerateContentStrategyInput = z.infer<typeof generateContentStrategySchema>;
export type RegenerateContentStrategyInput = z.infer<typeof regenerateContentStrategySchema>;
export type UpdateContentStrategyInput = z.infer<typeof updateContentStrategySchema>;
