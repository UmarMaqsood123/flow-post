import { ONBOARDING_POSITIONS, ONBOARDING_STEPS } from "@/config/brandProfile";
import { type BrandProfileFormValues, ONBOARDING_STEP_FIELDS } from "@/schemas/brandProfile.schema";
import type {
  BrandProfile,
  BrandProfileUpdate,
  MissingField,
  OnboardingPosition,
  OnboardingStep,
} from "@/types/brandProfile";

export const toFormValues = (profile: BrandProfile): BrandProfileFormValues => ({
  businessName: profile.businessName ?? "",
  website: profile.website ?? "",
  industry: profile.industry ?? "",
  description: profile.description ?? "",
  productsServices: profile.productsServices,
  targetAudience: profile.targetAudience ?? "",
  targetLocations: profile.targetLocations,
  primaryGoal: profile.primaryGoal ?? "",
  brandVoice: { tones: profile.brandVoice.tones, notes: profile.brandVoice.notes ?? "" },
  keywords: profile.keywords,
  topics: profile.topics,
  competitors: profile.competitors.map(({ name, website }) => ({ name, website: website ?? "" })),
  preferredPlatforms: profile.preferredPlatforms,
  postingFrequency: profile.postingFrequency ?? "",
});

const isBlankCompetitor = ({ name, website }: { name: string; website: string }) =>
  !name.trim() && !website.trim();

/** Competitor rows left completely empty are dropped rather than rejected. */
export const withoutBlankCompetitors = (competitors: BrandProfileFormValues["competitors"]) =>
  competitors.filter((competitor) => !isBlankCompetitor(competitor));

export const toPayload = (values: BrandProfileFormValues): BrandProfileUpdate => ({
  ...values,
  competitors: withoutBlankCompetitors(values.competitors),
});

export const toStepPayload = (
  values: BrandProfileFormValues,
  step: OnboardingStep,
): BrandProfileUpdate => {
  const payload = toPayload(values);
  return Object.fromEntries(
    ONBOARDING_STEP_FIELDS[step].map((field) => [field, payload[field]]),
  ) as BrandProfileUpdate;
};

/** True when the step's form values differ from what is saved. */
export const stepHasChanges = (
  values: BrandProfileFormValues,
  profile: BrandProfile,
  step: OnboardingStep,
) => {
  const saved = toFormValues(profile);
  return ONBOARDING_STEP_FIELDS[step].some(
    (field) => JSON.stringify(values[field]) !== JSON.stringify(saved[field]),
  );
};

export const isOnboardingPosition = (value: unknown): value is OnboardingPosition =>
  ONBOARDING_POSITIONS.includes(value as OnboardingPosition);

export const isStepDone = (profile: BrandProfile, step: OnboardingStep) =>
  profile.onboarding.completedSteps.includes(step) ||
  profile.onboarding.skippedSteps.includes(step);

const firstOpenStep = (profile: BrandProfile): OnboardingStep | undefined =>
  ONBOARDING_STEPS.find((step) => !isStepDone(profile, step));

/** Users can revisit finished steps and open the next unfinished one, but not jump ahead. */
export const canVisitPosition = (profile: BrandProfile, position: OnboardingPosition) => {
  const open = firstOpenStep(profile);
  if (profile.onboarding.status === "COMPLETED" || !open) return true;
  return ONBOARDING_POSITIONS.indexOf(position) <= ONBOARDING_POSITIONS.indexOf(open);
};

/** Where to resume: the saved position when it is still reachable, else the first open step. */
export const resumePosition = (profile: BrandProfile): OnboardingPosition => {
  if (profile.onboarding.status === "COMPLETED") return "review";
  const saved = profile.onboarding.currentStep;
  return canVisitPosition(profile, saved) ? saved : (firstOpenStep(profile) ?? "review");
};

export const getOnboardingProgress = (profile: BrandProfile) => {
  const done = ONBOARDING_STEPS.filter((step) => isStepDone(profile, step)).length;
  const total = ONBOARDING_STEPS.length;
  const percent =
    profile.onboarding.status === "COMPLETED" ? 100 : Math.round((done / total) * 100);
  return { done, total, percent };
};

export const isMissingField = (value: unknown): value is MissingField =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as MissingField).path === "string" &&
  typeof (value as MissingField).message === "string" &&
  ONBOARDING_STEPS.includes((value as MissingField).step);
