import type {
  BrandGoal,
  BrandTone,
  OnboardingPosition,
  OnboardingStep,
  PostingFrequency,
  SocialPlatform,
} from "@/types/brandProfile";

/** Mirrors backend/src/constants/brandProfile.constant.ts. */

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export const BRAND_GOAL_OPTIONS: ChoiceOption<BrandGoal>[] = [
  {
    value: "GENERATE_LEADS",
    label: "Generate leads",
    description: "Turn followers into inquiries, sign-ups and booked calls.",
  },
  {
    value: "BRAND_AWARENESS",
    label: "Build brand awareness",
    description: "Get your name in front of more of the right people.",
  },
  {
    value: "ENGAGEMENT",
    label: "Increase engagement",
    description: "Get more comments, shares and conversations.",
  },
  {
    value: "WEBSITE_TRAFFIC",
    label: "Drive website traffic",
    description: "Send people to your site, blog or landing pages.",
  },
  {
    value: "SALES",
    label: "Increase sales",
    description: "Promote your products and offers.",
  },
  {
    value: "FOLLOWER_GROWTH",
    label: "Grow followers",
    description: "Build a larger, loyal audience over time.",
  },
  {
    value: "PERSONAL_BRAND",
    label: "Build a personal brand",
    description: "Become a trusted voice in your field.",
  },
];

export const SOCIAL_PLATFORM_OPTIONS: ChoiceOption<SocialPlatform>[] = [
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "X", label: "X (Twitter)" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "PINTEREST", label: "Pinterest" },
  { value: "THREADS", label: "Threads" },
];

export const POSTING_FREQUENCY_OPTIONS: ChoiceOption<PostingFrequency>[] = [
  { value: "DAILY", label: "Every day", description: "About 30 posts a month" },
  {
    value: "SEVERAL_TIMES_A_WEEK",
    label: "A few times a week",
    description: "12–16 posts a month",
  },
  { value: "WEEKLY", label: "Once a week", description: "About 4 posts a month" },
  {
    value: "SEVERAL_TIMES_A_MONTH",
    label: "A few times a month",
    description: "2–3 posts a month",
  },
  { value: "MONTHLY", label: "Once a month", description: "1 post a month" },
];

export const BRAND_TONE_OPTIONS: ChoiceOption<BrandTone>[] = [
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "FRIENDLY", label: "Friendly" },
  { value: "AUTHORITATIVE", label: "Authoritative" },
  { value: "EDUCATIONAL", label: "Educational" },
  { value: "INSPIRATIONAL", label: "Inspirational" },
  { value: "PLAYFUL", label: "Playful" },
  { value: "WITTY", label: "Witty" },
  { value: "BOLD", label: "Bold" },
  { value: "EMPATHETIC", label: "Empathetic" },
  { value: "CASUAL", label: "Casual" },
];

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

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "business",
  "audience",
  "goals",
  "voice",
  "competitors",
];
export const ONBOARDING_POSITIONS: OnboardingPosition[] = [...ONBOARDING_STEPS, "review"];

/** Steps without required fields, which can be skipped. */
export const OPTIONAL_STEPS: OnboardingStep[] = ["competitors"];

export const ONBOARDING_STEP_INFO: Record<
  OnboardingPosition,
  { title: string; heading: string; description: string }
> = {
  business: {
    title: "Business",
    heading: "Tell us about your business",
    description: "The basics FlowPost uses to describe your brand.",
  },
  audience: {
    title: "Audience",
    heading: "What you offer and who it's for",
    description: "Your products or services and the people you want to reach.",
  },
  goals: {
    title: "Goals",
    heading: "Goals and channels",
    description: "What success looks like, where you post and how often.",
  },
  voice: {
    title: "Voice",
    heading: "How your brand sounds",
    description: "The tone, keywords and topics your content should use.",
  },
  competitors: {
    title: "Competitors",
    heading: "Who you compete with",
    description: "Optional. Brands your audience compares you with.",
  },
  review: {
    title: "Review",
    heading: "Review your brand profile",
    description: "Check everything before you finish. You can edit any section.",
  },
};

export const optionLabel = <T extends string>(options: ChoiceOption<T>[], value: T): string =>
  options.find((option) => option.value === value)?.label ?? value;
