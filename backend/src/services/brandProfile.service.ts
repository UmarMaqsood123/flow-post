import type { Types } from "mongoose";
import { logger } from "../config/logger";
import {
  BRAND_PROFILE_FIELDS,
  type BrandProfileField,
  ONBOARDING_REQUIRED_FIELDS,
  ONBOARDING_STEP_FIELDS,
  ONBOARDING_STEPS,
  type OnboardingPositionValue,
  OnboardingStatus,
  type OnboardingStepValue,
} from "../constants/brandProfile.constant";
import {
  BrandProfile,
  type BrandProfileDocument,
  type PublicBrandProfile,
  toPublicBrandProfile,
} from "../models/brandProfile.model";
import type { UserDocument } from "../models/user.model";
import type { WorkspaceDocument } from "../models/workspace.model";
import { AppError } from "../utils/appError.util";
import type { WorkspaceContext } from "../utils/workspaceContext.util";
import type {
  BrandProfileFieldsInput,
  SaveOnboardingStepInput,
  UpdateBrandProfileInput,
} from "../validators/brandProfile.validator";

/** A required field that is still empty, with the step where it can be filled in. */
export interface MissingField {
  path: string;
  message: string;
  step: OnboardingStepValue;
}

const REQUIRED_MESSAGES: Partial<Record<BrandProfileField, string>> = {
  businessName: "Business name is required",
  industry: "Choose an industry",
  description: "Describe your business",
  productsServices: "Add at least one product or service",
  targetAudience: "Describe your target audience",
  primaryGoal: "Choose your primary goal",
  preferredPlatforms: "Choose at least one platform",
  postingFrequency: "Choose how often you want to post",
  brandVoice: "Choose at least one tone for your brand voice",
};

const isBlank = (profile: BrandProfileDocument, field: BrandProfileField): boolean => {
  if (field === "brandVoice") return profile.brandVoice.tones.length === 0;
  const value: unknown = profile.get(field);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return value === null || value === undefined;
};

export const findMissingFields = (
  profile: BrandProfileDocument,
  steps: readonly OnboardingStepValue[],
): MissingField[] =>
  steps.flatMap((step) =>
    ONBOARDING_REQUIRED_FIELDS[step]
      .filter((field) => isBlank(profile, field))
      .map((field) => ({
        path: field === "brandVoice" ? "brandVoice.tones" : field,
        message: REQUIRED_MESSAGES[field] ?? `${field} is required`,
        step,
      })),
  );

/** The saved profile, or a new unsaved one prefilled from the workspace details. */
const loadProfile = async (workspace: WorkspaceDocument): Promise<BrandProfileDocument> =>
  (await BrandProfile.findOne({ workspace: workspace._id })) ??
  new BrandProfile({
    workspace: workspace._id,
    businessName: workspace.name,
    website: workspace.website,
    industry: workspace.industry,
    description: workspace.description,
  });

const applyFields = (
  profile: BrandProfileDocument,
  input: BrandProfileFieldsInput,
  allowed: readonly BrandProfileField[],
) => {
  for (const field of allowed) {
    const value = input[field];
    if (value !== undefined) profile.set(field, value);
  }
};

const isStepDone = (profile: BrandProfileDocument, step: OnboardingStepValue) =>
  profile.onboarding.completedSteps.includes(step) ||
  profile.onboarding.skippedSteps.includes(step);

/** The first step not yet completed or skipped, then the review screen. */
const resumePosition = (profile: BrandProfileDocument): OnboardingPositionValue =>
  profile.onboarding.status === OnboardingStatus.COMPLETED
    ? "review"
    : (ONBOARDING_STEPS.find((step) => !isStepDone(profile, step)) ?? "review");

const markInProgress = (profile: BrandProfileDocument) => {
  if (profile.onboarding.status === OnboardingStatus.NOT_STARTED) {
    profile.onboarding.status = OnboardingStatus.IN_PROGRESS;
    profile.onboarding.startedAt = new Date();
  }
};

const saveProfile = async (
  profile: BrandProfileDocument,
  user: UserDocument,
): Promise<PublicBrandProfile> => {
  const isNew = profile.isNew;
  profile.updatedBy = user._id;
  try {
    await profile.save();
  } catch (error) {
    // Two teammates saved the first draft at the same time; the unique index kept one.
    if (isNew && (error as { code?: unknown }).code === 11000) {
      throw AppError.conflict("A teammate just started this brand profile. Reload and try again.");
    }
    throw error;
  }
  return toPublicBrandProfile(profile);
};

export const getBrandProfile = async ({
  workspace,
}: WorkspaceContext): Promise<PublicBrandProfile> =>
  toPublicBrandProfile(await loadProfile(workspace));

/** Saves a draft. Once onboarding is complete, required fields can no longer be cleared. */
export const updateBrandProfile = async (
  { workspace, user }: WorkspaceContext,
  { currentStep, ...input }: UpdateBrandProfileInput,
): Promise<PublicBrandProfile> => {
  const profile = await loadProfile(workspace);
  applyFields(profile, input, BRAND_PROFILE_FIELDS);

  if (profile.onboarding.status === OnboardingStatus.COMPLETED) {
    const missing = findMissingFields(profile, ONBOARDING_STEPS);
    if (missing.length > 0) {
      throw AppError.validation("Required brand profile fields can't be cleared", missing);
    }
  } else {
    markInProgress(profile);
    if (currentStep) profile.onboarding.currentStep = currentStep;
  }

  return saveProfile(profile, user);
};

/** Saves one step after checking its required fields, or skips a step that has none. */
export const saveOnboardingStep = async (
  { workspace, user }: WorkspaceContext,
  step: OnboardingStepValue,
  { skipped, ...input }: SaveOnboardingStepInput,
): Promise<PublicBrandProfile> => {
  const profile = await loadProfile(workspace);
  const { completedSteps, skippedSteps } = profile.onboarding;
  const withStep = (steps: OnboardingStepValue[]) =>
    ONBOARDING_STEPS.filter((item) => item === step || steps.includes(item));
  const withoutStep = (steps: OnboardingStepValue[]) => steps.filter((item) => item !== step);

  if (skipped) {
    if (ONBOARDING_REQUIRED_FIELDS[step].length > 0) {
      throw AppError.badRequest("This step has required fields, so it can't be skipped");
    }
    profile.set("onboarding.completedSteps", withoutStep(completedSteps));
    profile.set("onboarding.skippedSteps", withStep(skippedSteps));
  } else {
    applyFields(profile, input, ONBOARDING_STEP_FIELDS[step]);
    const missing = findMissingFields(profile, [step]);
    if (missing.length > 0) {
      throw AppError.validation("Fill in the required fields to continue", missing);
    }
    profile.set("onboarding.completedSteps", withStep(completedSteps));
    profile.set("onboarding.skippedSteps", withoutStep(skippedSteps));
  }

  markInProgress(profile);
  profile.onboarding.currentStep = resumePosition(profile);
  return saveProfile(profile, user);
};

/** Marks onboarding complete once every required field is filled in. Idempotent. */
export const completeOnboarding = async ({
  workspace,
  user,
}: WorkspaceContext): Promise<PublicBrandProfile> => {
  const profile = await loadProfile(workspace);
  if (profile.onboarding.status === OnboardingStatus.COMPLETED) {
    return toPublicBrandProfile(profile);
  }

  const missing = findMissingFields(profile, ONBOARDING_STEPS);
  if (missing.length > 0) {
    throw AppError.validation("Complete the required onboarding steps first", missing);
  }

  const now = new Date();
  profile.onboarding.status = OnboardingStatus.COMPLETED;
  profile.onboarding.startedAt ??= now;
  profile.onboarding.completedAt = now;
  profile.onboarding.completedBy = user._id;
  profile.onboarding.currentStep = "review";

  const result = await saveProfile(profile, user);
  logger.info({ userId: user.id, workspaceId: workspace.id }, "Brand onboarding completed");
  return result;
};

export const deleteWorkspaceBrandProfile = async (workspaceId: Types.ObjectId): Promise<void> => {
  await BrandProfile.deleteMany({ workspace: workspaceId });
};
