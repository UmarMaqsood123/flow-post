import { z } from "zod";
import {
  BRAND_GOALS,
  BRAND_PROFILE_LIMITS as LIMITS,
  BRAND_TONES,
  type BrandProfileField,
  ONBOARDING_POSITIONS,
  ONBOARDING_STEPS,
  POSTING_FREQUENCIES,
  SOCIAL_PLATFORMS,
} from "../constants/brandProfile.constant";
import { WORKSPACE_INDUSTRIES } from "../constants/workspace.constant";
import { objectIdField } from "./common.validator";
import { emptyToNull, nullableHttpUrl, nullableText } from "./workspace.validator";

/** Guards against huge arrays before de-duplication; the real limits apply afterwards. */
const MAX_RAW_ITEMS = 100;

/** Case-insensitive de-duplication that keeps the first spelling and drops blanks. */
export const uniqueValues = <T extends string>(values: T[]): T[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const textList = (
  plural: string,
  singular: string,
  { items, length }: { items: number; length: number },
) =>
  z
    .array(
      z
        .string({ error: `Each ${singular} must be text` })
        .trim()
        .max(length, `Each ${singular} must be at most ${length} characters`),
      { error: `${plural} must be a list` },
    )
    .max(MAX_RAW_ITEMS, `Add up to ${items} ${plural}`)
    .transform(uniqueValues)
    .refine((values) => values.length <= items, `Add up to ${items} ${plural}`);

const competitorSchema = z.object({
  name: z
    .string({ error: "Enter the competitor's name" })
    .trim()
    .min(1, "Enter the competitor's name")
    .max(
      LIMITS.competitorName,
      `Competitor names must be at most ${LIMITS.competitorName} characters`,
    ),
  website: nullableHttpUrl("Competitor website")
    .optional()
    .transform((value) => emptyToNull(value) ?? null),
});

const fields = {
  businessName: nullableText(LIMITS.businessName, "Business name"),
  website: nullableHttpUrl("Website").transform(emptyToNull),
  industry: z
    .union([
      z.null(),
      z.literal(""),
      z.enum(WORKSPACE_INDUSTRIES, { error: "Choose an industry from the list" }),
    ])
    .transform(emptyToNull),
  description: nullableText(LIMITS.description, "Business description"),
  productsServices: textList("products or services", "product or service", LIMITS.productsServices),
  targetAudience: nullableText(LIMITS.targetAudience, "Target audience"),
  targetLocations: textList("locations", "location", LIMITS.targetLocations),
  primaryGoal: z
    .union([z.null(), z.literal(""), z.enum(BRAND_GOALS, { error: "Choose a goal from the list" })])
    .transform(emptyToNull),
  /** Replaced as a whole — send both tones and notes. */
  brandVoice: z.object({
    tones: z
      .array(z.enum(BRAND_TONES, { error: "Choose tones from the list" }))
      .max(MAX_RAW_ITEMS)
      .transform((tones) => [...new Set(tones)])
      .refine((tones) => tones.length <= LIMITS.tones, `Choose up to ${LIMITS.tones} tones`),
    notes: nullableText(LIMITS.voiceNotes, "Voice notes")
      .optional()
      .transform((value) => value ?? null),
  }),
  keywords: textList("keywords", "keyword", LIMITS.keywords),
  topics: textList("topics", "topic", LIMITS.topics),
  competitors: z
    .array(competitorSchema)
    .max(LIMITS.competitors, `Add up to ${LIMITS.competitors} competitors`),
  preferredPlatforms: z
    .array(z.enum(SOCIAL_PLATFORMS, { error: "Choose platforms from the list" }))
    .max(MAX_RAW_ITEMS)
    .transform((platforms) => [...new Set(platforms)]),
  postingFrequency: z
    .union([
      z.null(),
      z.literal(""),
      z.enum(POSTING_FREQUENCIES, { error: "Choose a posting frequency from the list" }),
    ])
    .transform(emptyToNull),
} satisfies Record<BrandProfileField, z.ZodType>;

/**
 * Every field is optional here; required fields are enforced when a step or the
 * whole onboarding is completed. Unknown keys (e.g. `onboarding`, `workspace`) are stripped.
 */
const brandProfileFieldsSchema = z.object(fields).partial();

/** Draft save — any subset of fields, plus where to resume the wizard. */
export const updateBrandProfileSchema = brandProfileFieldsSchema.extend({
  currentStep: z.enum(ONBOARDING_POSITIONS, { error: "Unknown onboarding step" }).optional(),
});

export const onboardingStepParamsSchema = z.object({
  workspaceId: objectIdField,
  step: z.enum(ONBOARDING_STEPS, { error: "Unknown onboarding step" }),
});

/** Only the step's own fields are applied. */
export const saveOnboardingStepSchema = brandProfileFieldsSchema.extend({
  /** Skips a step that has no required fields, leaving its values unchanged. */
  skipped: z.boolean({ error: "skipped must be true or false" }).optional(),
});

export type BrandProfileFieldsInput = z.infer<typeof brandProfileFieldsSchema>;
export type UpdateBrandProfileInput = z.infer<typeof updateBrandProfileSchema>;
export type OnboardingStepParams = z.infer<typeof onboardingStepParamsSchema>;
export type SaveOnboardingStepInput = z.infer<typeof saveOnboardingStepSchema>;
