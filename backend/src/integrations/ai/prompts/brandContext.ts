import type {
  BrandGoalValue,
  BrandToneValue,
  PostingFrequencyValue,
  SocialPlatformValue,
} from "../../../constants/brandProfile.constant";
import type { PublicBrandProfile } from "../../../models/brandProfile.model";
import { PLATFORM_GUIDELINES } from "./platforms";

export const GOAL_LABELS: Record<BrandGoalValue, string> = {
  GENERATE_LEADS: "Generate leads",
  BRAND_AWARENESS: "Build brand awareness",
  ENGAGEMENT: "Increase engagement",
  WEBSITE_TRAFFIC: "Drive website traffic",
  SALES: "Increase sales",
  FOLLOWER_GROWTH: "Grow followers",
  PERSONAL_BRAND: "Build a personal brand",
};

export const TONE_LABELS: Record<BrandToneValue, string> = {
  PROFESSIONAL: "Professional",
  FRIENDLY: "Friendly",
  AUTHORITATIVE: "Authoritative",
  EDUCATIONAL: "Educational",
  INSPIRATIONAL: "Inspirational",
  PLAYFUL: "Playful",
  WITTY: "Witty",
  BOLD: "Bold",
  EMPATHETIC: "Empathetic",
  CASUAL: "Casual",
};

const FREQUENCY_LABELS: Record<PostingFrequencyValue, string> = {
  DAILY: "Every day",
  SEVERAL_TIMES_A_WEEK: "A few times a week",
  WEEKLY: "Once a week",
  SEVERAL_TIMES_A_MONTH: "A few times a month",
  MONTHLY: "Once a month",
};

const DEFAULT_PLATFORMS: SocialPlatformValue[] = ["LINKEDIN", "INSTAGRAM"];

export interface BrandContext {
  profile: PublicBrandProfile;
  /** True once brand onboarding has been completed. */
  complete: boolean;
  /** Prompt-ready summary of the profile. */
  text: string;
}

/** Single line, so profile values can't restructure the prompt. */
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const list = (values: string[]) => (values.length ? values.map(clean).join("; ") : null);

/** Formats the brand profile as "Label: value" lines, omitting anything empty. */
export const formatBrandProfile = (profile: PublicBrandProfile): string => {
  const entries: [string, string | null][] = [
    ["Business name", profile.businessName],
    ["Website", profile.website],
    ["Industry", profile.industry],
    ["What the business does", profile.description],
    ["Products and services", list(profile.productsServices)],
    ["Target audience", profile.targetAudience],
    ["Target locations", list(profile.targetLocations)],
    ["Primary goal", profile.primaryGoal ? GOAL_LABELS[profile.primaryGoal] : null],
    ["Brand voice", list(profile.brandVoice.tones.map((tone) => TONE_LABELS[tone]))],
    ["Voice notes", profile.brandVoice.notes],
    ["Keywords to use naturally", list(profile.keywords)],
    ["Topics the brand covers", list(profile.topics)],
    [
      "Competitors (context only; don't name them unless asked)",
      list(profile.competitors.map((competitor) => competitor.name)),
    ],
    [
      "Preferred platforms",
      list(profile.preferredPlatforms.map((platform) => PLATFORM_GUIDELINES[platform].label)),
    ],
    [
      "Posting frequency",
      profile.postingFrequency ? FREQUENCY_LABELS[profile.postingFrequency] : null,
    ],
  ];
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([label, value]) => `${label}: ${clean(value)}`)
    .join("\n");
};

export const buildBrandContext = (profile: PublicBrandProfile): BrandContext => ({
  profile,
  complete: profile.onboarding.status === "COMPLETED",
  text: formatBrandProfile(profile) || "No brand details have been provided yet.",
});

/** Requested platforms, else the brand's preferred platforms, else a sensible default. */
export const resolvePlatforms = (
  brand: BrandContext,
  requested?: SocialPlatformValue[],
): SocialPlatformValue[] => {
  if (requested?.length) return requested;
  return brand.profile.preferredPlatforms.length
    ? brand.profile.preferredPlatforms
    : DEFAULT_PLATFORMS;
};

export const goalLabel = (brand: BrandContext, goal?: BrandGoalValue) => {
  const value = goal ?? brand.profile.primaryGoal;
  return value ? GOAL_LABELS[value] : "Increase engagement";
};
