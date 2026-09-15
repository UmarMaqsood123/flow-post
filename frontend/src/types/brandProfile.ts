/** Mirrors `PublicBrandProfile` in backend/src/models/brandProfile.model.ts. */

export type BrandGoal =
  | "GENERATE_LEADS"
  | "BRAND_AWARENESS"
  | "ENGAGEMENT"
  | "WEBSITE_TRAFFIC"
  | "SALES"
  | "FOLLOWER_GROWTH"
  | "PERSONAL_BRAND";

export type SocialPlatform =
  "LINKEDIN" | "INSTAGRAM" | "FACEBOOK" | "X" | "TIKTOK" | "YOUTUBE" | "PINTEREST" | "THREADS";

export type PostingFrequency =
  "DAILY" | "SEVERAL_TIMES_A_WEEK" | "WEEKLY" | "SEVERAL_TIMES_A_MONTH" | "MONTHLY";

export type BrandTone =
  | "PROFESSIONAL"
  | "FRIENDLY"
  | "AUTHORITATIVE"
  | "EDUCATIONAL"
  | "INSPIRATIONAL"
  | "PLAYFUL"
  | "WITTY"
  | "BOLD"
  | "EMPATHETIC"
  | "CASUAL";

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type OnboardingStep = "business" | "audience" | "goals" | "voice" | "competitors";
/** A wizard step or the final review screen. */
export type OnboardingPosition = OnboardingStep | "review";

export interface Competitor {
  name: string;
  website: string | null;
}

export interface BrandProfile {
  /** Null until the profile is first saved. */
  id: string | null;
  businessName: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  productsServices: string[];
  targetAudience: string | null;
  targetLocations: string[];
  primaryGoal: BrandGoal | null;
  brandVoice: { tones: BrandTone[]; notes: string | null };
  keywords: string[];
  topics: string[];
  competitors: Competitor[];
  preferredPlatforms: SocialPlatform[];
  postingFrequency: PostingFrequency | null;
  onboarding: {
    status: OnboardingStatus;
    currentStep: OnboardingPosition;
    completedSteps: OnboardingStep[];
    skippedSteps: OnboardingStep[];
    startedAt: string | null;
    completedAt: string | null;
  };
  updatedAt: string | null;
}

/** Request body for saving fields. Empty strings clear optional fields. */
export interface BrandProfileFields {
  businessName: string;
  website: string;
  industry: string;
  description: string;
  productsServices: string[];
  targetAudience: string;
  targetLocations: string[];
  primaryGoal: string;
  brandVoice: { tones: string[]; notes: string };
  keywords: string[];
  topics: string[];
  competitors: { name: string; website: string }[];
  preferredPlatforms: string[];
  postingFrequency: string;
}

export type BrandProfileUpdate = Partial<BrandProfileFields> & {
  currentStep?: OnboardingPosition;
};

/** A required field the API reported as missing, with the step where it's filled in. */
export interface MissingField {
  path: string;
  message: string;
  step: OnboardingStep;
}
