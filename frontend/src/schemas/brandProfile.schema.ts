import { z } from "zod";
import { BRAND_PROFILE_LIMITS as LIMITS } from "@/config/brandProfile";
import type { OnboardingPosition, OnboardingStep } from "@/types/brandProfile";
import { optionalUrl } from "./workspace.schema";

/**
 * Mirrors backend/src/validators/brandProfile.validator.ts and the required
 * fields in backend/src/constants/brandProfile.constant.ts. The wizard validates
 * one step at a time with `trigger(ONBOARDING_STEP_FIELDS[step])`.
 */

const textList = (plural: string, { items, length }: { items: number; length: number }) =>
  z
    .array(z.string().max(length, `Each entry must be at most ${length} characters`))
    .max(items, `Add up to ${items} ${plural}`);

const longText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`);

export const brandProfileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(LIMITS.businessName, `Business name must be at most ${LIMITS.businessName} characters`),
  website: optionalUrl("Website"),
  industry: z.string().min(1, "Choose an industry"),
  description: longText("Description", LIMITS.description).min(1, "Describe your business"),
  productsServices: textList("products or services", LIMITS.productsServices).min(
    1,
    "Add at least one product or service",
  ),
  targetAudience: longText("Target audience", LIMITS.targetAudience).min(
    1,
    "Describe your target audience",
  ),
  targetLocations: textList("locations", LIMITS.targetLocations),
  primaryGoal: z.string().min(1, "Choose your primary goal"),
  brandVoice: z.object({
    tones: z
      .array(z.string())
      .min(1, "Choose at least one tone")
      .max(LIMITS.tones, `Choose up to ${LIMITS.tones} tones`),
    notes: longText("Voice notes", LIMITS.voiceNotes),
  }),
  keywords: textList("keywords", LIMITS.keywords),
  topics: textList("topics", LIMITS.topics),
  competitors: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1, "Enter the competitor's name")
          .max(LIMITS.competitorName, `Names must be at most ${LIMITS.competitorName} characters`),
        website: optionalUrl("Website"),
      }),
    )
    .max(LIMITS.competitors, `Add up to ${LIMITS.competitors} competitors`),
  preferredPlatforms: z.array(z.string()).min(1, "Choose at least one platform"),
  postingFrequency: z.string().min(1, "Choose how often you want to post"),
});

export type BrandProfileFormValues = z.infer<typeof brandProfileSchema>;
type FormField = keyof BrandProfileFormValues;

export const BRAND_PROFILE_FORM_FIELDS = Object.keys(brandProfileSchema.shape) as FormField[];

export const ONBOARDING_STEP_FIELDS: Record<OnboardingStep, FormField[]> = {
  business: ["businessName", "website", "industry", "description"],
  audience: ["productsServices", "targetAudience", "targetLocations"],
  goals: ["primaryGoal", "preferredPlatforms", "postingFrequency"],
  voice: ["brandVoice", "keywords", "topics"],
  competitors: ["competitors"],
};

const pickFields = (fields: FormField[]) =>
  brandProfileSchema.pick(
    Object.fromEntries(fields.map((field) => [field, true])) as Record<FormField, true>,
  );

/** Validates what is on screen: one step's fields, or everything on the review screen. */
export const onboardingSchemaFor = (position: OnboardingPosition) =>
  (position === "review"
    ? brandProfileSchema
    : pickFields(ONBOARDING_STEP_FIELDS[position])) as unknown as z.ZodType<
    BrandProfileFormValues,
    BrandProfileFormValues
  >;
