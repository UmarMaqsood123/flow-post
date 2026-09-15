/** Mirrored in frontend/src/config/brandProfile.ts. */
export const BRAND_GOALS = [
  "GENERATE_LEADS",
  "BRAND_AWARENESS",
  "ENGAGEMENT",
  "WEBSITE_TRAFFIC",
  "SALES",
  "FOLLOWER_GROWTH",
  "PERSONAL_BRAND",
] as const;
export type BrandGoalValue = (typeof BRAND_GOALS)[number];

export const SOCIAL_PLATFORMS = [
  "LINKEDIN",
  "INSTAGRAM",
  "FACEBOOK",
  "X",
  "TIKTOK",
  "YOUTUBE",
  "PINTEREST",
  "THREADS",
] as const;
export type SocialPlatformValue = (typeof SOCIAL_PLATFORMS)[number];

export const POSTING_FREQUENCIES = [
  "DAILY",
  "SEVERAL_TIMES_A_WEEK",
  "WEEKLY",
  "SEVERAL_TIMES_A_MONTH",
  "MONTHLY",
] as const;
export type PostingFrequencyValue = (typeof POSTING_FREQUENCIES)[number];

export const BRAND_TONES = [
  "PROFESSIONAL",
  "FRIENDLY",
  "AUTHORITATIVE",
  "EDUCATIONAL",
  "INSPIRATIONAL",
  "PLAYFUL",
  "WITTY",
  "BOLD",
  "EMPATHETIC",
  "CASUAL",
] as const;
export type BrandToneValue = (typeof BRAND_TONES)[number];

export const OnboardingStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
export type OnboardingStatusValue = (typeof OnboardingStatus)[keyof typeof OnboardingStatus];

/** Wizard steps in order. The review screen ("review") comes after the last step. */
export const ONBOARDING_STEPS = ["business", "audience", "goals", "voice", "competitors"] as const;
export type OnboardingStepValue = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_POSITIONS = [...ONBOARDING_STEPS, "review"] as const;
export type OnboardingPositionValue = (typeof ONBOARDING_POSITIONS)[number];

export const BRAND_PROFILE_FIELDS = [
  "businessName",
  "website",
  "industry",
  "description",
  "productsServices",
  "targetAudience",
  "targetLocations",
  "primaryGoal",
  "brandVoice",
  "keywords",
  "topics",
  "competitors",
  "preferredPlatforms",
  "postingFrequency",
] as const;
export type BrandProfileField = (typeof BRAND_PROFILE_FIELDS)[number];

/** The fields each step saves. */
export const ONBOARDING_STEP_FIELDS: Record<OnboardingStepValue, readonly BrandProfileField[]> = {
  business: ["businessName", "website", "industry", "description"],
  audience: ["productsServices", "targetAudience", "targetLocations"],
  goals: ["primaryGoal", "preferredPlatforms", "postingFrequency"],
  voice: ["brandVoice", "keywords", "topics"],
  competitors: ["competitors"],
};

/** Fields that must be filled in to complete a step. Steps with none can be skipped. */
export const ONBOARDING_REQUIRED_FIELDS: Record<OnboardingStepValue, readonly BrandProfileField[]> =
  {
    business: ["businessName", "industry", "description"],
    audience: ["productsServices", "targetAudience"],
    goals: ["primaryGoal", "preferredPlatforms", "postingFrequency"],
    voice: ["brandVoice"],
    competitors: [],
  };

export const BRAND_PROFILE_LIMITS = {
  businessName: 120,
  description: 1000,
  targetAudience: 1000,
  voiceNotes: 500,
  productsServices: { items: 20, length: 120 },
  targetLocations: { items: 20, length: 100 },
  keywords: { items: 30, length: 50 },
  topics: { items: 20, length: 80 },
  competitors: 10,
  competitorName: 120,
  tones: 5,
} as const;
