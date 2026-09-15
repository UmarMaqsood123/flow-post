import type { BrandGoal, SocialPlatform } from "./brandProfile";

/** Mirrors backend/src/validators/contentStrategy.validator.ts and models/contentStrategy.model.ts. */

export type PostFormat =
  "TEXT" | "IMAGE" | "CAROUSEL" | "VIDEO" | "SHORT_VIDEO" | "POLL" | "ARTICLE";
export type Weekday =
  "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
export type StrategyTimeframe = "WEEK" | "MONTH" | "QUARTER";
export type ContentStrategyStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface AudienceSegment {
  name: string;
  description: string;
  painPoints: string[];
  motivations: string[];
  contentPreferences: string[];
}

export interface AudienceAnalysis {
  summary: string;
  segments: AudienceSegment[];
}

export interface ContentPillar {
  name: string;
  description: string;
  objective: string;
  exampleTopics: string[];
}

export interface RecommendedTopic {
  title: string;
  /** Name of a content pillar. */
  pillar: string;
  angle: string;
  format: PostFormat;
  platforms: SocialPlatform[];
}

export interface PlatformPlan {
  platform: SocialPlatform;
  role: string;
  audienceFit: string;
  contentFocus: string;
  formats: PostFormat[];
}

export interface BrandTone {
  summary: string;
  voiceAttributes: string[];
  dos: string[];
  donts: string[];
  examplePhrases: string[];
}

export interface CallToAction {
  text: string;
  goal: BrandGoal;
  placement: string;
}

export interface CtaStrategy {
  summary: string;
  primaryGoal: BrandGoal;
  ctas: CallToAction[];
}

export interface PlatformSchedule {
  platform: SocialPlatform;
  postsPerWeek: number;
  bestDays: Weekday[];
  timing: string;
}

export interface PostingFrequencyPlan {
  summary: string;
  postsPerWeek: number;
  platforms: PlatformSchedule[];
}

export interface FormatShare {
  format: PostFormat;
  /** Whole percent; all shares add up to 100. */
  sharePercent: number;
  purpose: string;
}

export interface HashtagApproach {
  summary: string;
  minPerPost: number;
  maxPerPost: number;
  branded: string[];
  community: string[];
  niche: string[];
  guidelines: string[];
}

export interface StrategyContent {
  audienceAnalysis: AudienceAnalysis;
  contentPillars: ContentPillar[];
  recommendedTopics: RecommendedTopic[];
  platformStrategy: PlatformPlan[];
  brandTone: BrandTone;
  ctaStrategy: CtaStrategy;
  postingFrequency: PostingFrequencyPlan;
  contentFormats: FormatShare[];
  hashtagApproach: HashtagApproach;
}

export type StrategySectionKey = keyof StrategyContent;

export interface UserReference {
  id: string;
  name: string;
}

export interface ContentStrategySummary {
  id: string;
  version: number;
  name: string | null;
  status: ContentStrategyStatus;
  inputs: {
    timeframe: StrategyTimeframe;
    /** Empty means the brand profile's preferred platforms. */
    platforms: SocialPlatform[];
    focus: string | null;
    instructions: string | null;
  };
  generation: {
    provider: string;
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
    brandProfileUpdatedAt: string | null;
    brandProfileComplete: boolean;
    warnings: string[];
    generatedAt: string;
  };
  basedOnVersion: number | null;
  /** Sent back when saving, so a save can't overwrite a teammate's newer changes. */
  revision: number;
  createdBy: UserReference | null;
  editedBy: UserReference | null;
  editedAt: string | null;
  activatedBy: UserReference | null;
  activatedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentStrategy extends ContentStrategySummary {
  content: StrategyContent;
}

export interface GeneratedStrategy {
  strategy: ContentStrategy;
  warnings: string[];
}

export interface GenerateStrategyPayload {
  name?: string;
  timeframe: StrategyTimeframe;
  platforms?: SocialPlatform[];
  focus?: string;
}

export interface RegenerateStrategyPayload {
  timeframe?: StrategyTimeframe;
  platforms?: SocialPlatform[];
  /** An empty string clears the previous focus. */
  focus?: string;
  instructions?: string;
}

export interface UpdateStrategyPayload {
  revision: number;
  name?: string | null;
  sections?: Partial<StrategyContent>;
}
