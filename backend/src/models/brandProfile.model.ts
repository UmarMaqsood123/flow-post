import mongoose, { type HydratedDocument, type Model, Schema, type Types } from "mongoose";
import {
  BRAND_GOALS,
  BRAND_PROFILE_LIMITS as LIMITS,
  BRAND_TONES,
  type BrandGoalValue,
  type BrandToneValue,
  ONBOARDING_POSITIONS,
  ONBOARDING_STEPS,
  type OnboardingPositionValue,
  OnboardingStatus,
  type OnboardingStatusValue,
  type OnboardingStepValue,
  POSTING_FREQUENCIES,
  type PostingFrequencyValue,
  SOCIAL_PLATFORMS,
  type SocialPlatformValue,
} from "../constants/brandProfile.constant";
import { WORKSPACE_INDUSTRIES } from "../constants/workspace.constant";
import { workspaceScopedPlugin } from "./plugins/workspaceScoped.plugin";

export interface ICompetitor {
  name: string;
  website: string | null;
}

export interface IBrandVoice {
  tones: BrandToneValue[];
  notes: string | null;
}

export interface IOnboarding {
  status: OnboardingStatusValue;
  /** Where the wizard resumes. */
  currentStep: OnboardingPositionValue;
  completedSteps: OnboardingStepValue[];
  skippedSteps: OnboardingStepValue[];
  startedAt: Date | null;
  completedAt: Date | null;
  completedBy: Types.ObjectId | null;
}

/** One per workspace. Fields stay optional while onboarding is in progress. */
export interface IBrandProfile {
  workspace: Types.ObjectId;
  businessName: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  productsServices: string[];
  targetAudience: string | null;
  targetLocations: string[];
  primaryGoal: BrandGoalValue | null;
  brandVoice: IBrandVoice;
  keywords: string[];
  topics: string[];
  competitors: ICompetitor[];
  preferredPlatforms: SocialPlatformValue[];
  postingFrequency: PostingFrequencyValue | null;
  onboarding: IOnboarding;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BrandProfileDocument = HydratedDocument<IBrandProfile>;

const nullableString = (maxlength: number) => ({ type: String, default: null, maxlength });
const stringList = (maxlength: number) => ({ type: [{ type: String, maxlength }], default: [] });
const enumList = (values: readonly string[]) => ({
  type: [{ type: String, enum: [...values] }],
  default: [],
});

const CompetitorSchema = new Schema<ICompetitor>(
  {
    name: { type: String, required: true, maxlength: LIMITS.competitorName },
    website: nullableString(2048),
  },
  { _id: false },
);

const BrandProfileSchema = new Schema<IBrandProfile>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    businessName: nullableString(LIMITS.businessName),
    website: nullableString(2048),
    industry: { type: String, enum: [...WORKSPACE_INDUSTRIES, null], default: null },
    description: nullableString(LIMITS.description),
    productsServices: stringList(LIMITS.productsServices.length),
    targetAudience: nullableString(LIMITS.targetAudience),
    targetLocations: stringList(LIMITS.targetLocations.length),
    primaryGoal: { type: String, enum: [...BRAND_GOALS, null], default: null },
    brandVoice: {
      tones: enumList(BRAND_TONES),
      notes: nullableString(LIMITS.voiceNotes),
    },
    keywords: stringList(LIMITS.keywords.length),
    topics: stringList(LIMITS.topics.length),
    competitors: { type: [CompetitorSchema], default: [] },
    preferredPlatforms: enumList(SOCIAL_PLATFORMS),
    postingFrequency: { type: String, enum: [...POSTING_FREQUENCIES, null], default: null },
    onboarding: {
      status: {
        type: String,
        enum: Object.values(OnboardingStatus),
        default: OnboardingStatus.NOT_STARTED,
      },
      currentStep: { type: String, enum: [...ONBOARDING_POSITIONS], default: ONBOARDING_STEPS[0] },
      completedSteps: enumList(ONBOARDING_STEPS),
      skippedSteps: enumList(ONBOARDING_STEPS),
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

BrandProfileSchema.index({ workspace: 1 }, { unique: true });

BrandProfileSchema.plugin(workspaceScopedPlugin);

export const BrandProfile: Model<IBrandProfile> = mongoose.model<IBrandProfile>(
  "BrandProfile",
  BrandProfileSchema,
);

export interface PublicBrandProfile {
  /** Null until the profile is first saved. */
  id: string | null;
  businessName: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  productsServices: string[];
  targetAudience: string | null;
  targetLocations: string[];
  primaryGoal: BrandGoalValue | null;
  brandVoice: IBrandVoice;
  keywords: string[];
  topics: string[];
  competitors: ICompetitor[];
  preferredPlatforms: SocialPlatformValue[];
  postingFrequency: PostingFrequencyValue | null;
  onboarding: Omit<IOnboarding, "completedBy">;
  updatedAt: Date | null;
}

export const toPublicBrandProfile = (profile: BrandProfileDocument): PublicBrandProfile => ({
  id: profile.isNew ? null : profile._id.toString(),
  businessName: profile.businessName ?? null,
  website: profile.website ?? null,
  industry: profile.industry ?? null,
  description: profile.description ?? null,
  productsServices: [...profile.productsServices],
  targetAudience: profile.targetAudience ?? null,
  targetLocations: [...profile.targetLocations],
  primaryGoal: profile.primaryGoal ?? null,
  brandVoice: {
    tones: [...profile.brandVoice.tones],
    notes: profile.brandVoice.notes ?? null,
  },
  keywords: [...profile.keywords],
  topics: [...profile.topics],
  competitors: profile.competitors.map(({ name, website }) => ({ name, website: website ?? null })),
  preferredPlatforms: [...profile.preferredPlatforms],
  postingFrequency: profile.postingFrequency ?? null,
  onboarding: {
    status: profile.onboarding.status,
    currentStep: profile.onboarding.currentStep,
    completedSteps: [...profile.onboarding.completedSteps],
    skippedSteps: [...profile.onboarding.skippedSteps],
    startedAt: profile.onboarding.startedAt ?? null,
    completedAt: profile.onboarding.completedAt ?? null,
  },
  updatedAt: profile.isNew ? null : profile.updatedAt,
});
