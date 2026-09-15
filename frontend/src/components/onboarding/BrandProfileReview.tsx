import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import {
  BRAND_GOAL_OPTIONS,
  BRAND_TONE_OPTIONS,
  ONBOARDING_STEP_INFO,
  ONBOARDING_STEPS,
  optionLabel,
  POSTING_FREQUENCY_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
} from "@/config/brandProfile";
import type { BrandProfile, OnboardingStep } from "@/types/brandProfile";

interface ReviewItem {
  label: string;
  /** Null when empty. */
  value: ReactNode;
  required?: boolean;
}

const text = (value: string | null) =>
  value?.trim() ? <span className="whitespace-pre-line">{value}</span> : null;

const chips = (values: string[]) =>
  values.length > 0 ? (
    <ul className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <li key={value} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium">
          {value}
        </li>
      ))}
    </ul>
  ) : null;

const buildSections = (profile: BrandProfile): Record<OnboardingStep, ReviewItem[]> => ({
  business: [
    { label: "Business name", value: text(profile.businessName), required: true },
    { label: "Industry", value: text(profile.industry), required: true },
    {
      label: "Website",
      value: profile.website ? (
        <a
          href={profile.website}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary hover:underline"
        >
          {profile.website}
        </a>
      ) : null,
    },
    { label: "Description", value: text(profile.description), required: true },
  ],
  audience: [
    { label: "Products or services", value: chips(profile.productsServices), required: true },
    { label: "Target audience", value: text(profile.targetAudience), required: true },
    { label: "Target locations", value: chips(profile.targetLocations) },
  ],
  goals: [
    {
      label: "Primary goal",
      value: profile.primaryGoal ? optionLabel(BRAND_GOAL_OPTIONS, profile.primaryGoal) : null,
      required: true,
    },
    {
      label: "Preferred platforms",
      value: chips(
        profile.preferredPlatforms.map((platform) =>
          optionLabel(SOCIAL_PLATFORM_OPTIONS, platform),
        ),
      ),
      required: true,
    },
    {
      label: "Posting frequency",
      value: profile.postingFrequency
        ? optionLabel(POSTING_FREQUENCY_OPTIONS, profile.postingFrequency)
        : null,
      required: true,
    },
  ],
  voice: [
    {
      label: "Tone",
      value: chips(profile.brandVoice.tones.map((tone) => optionLabel(BRAND_TONE_OPTIONS, tone))),
      required: true,
    },
    { label: "Voice notes", value: text(profile.brandVoice.notes) },
    { label: "Keywords", value: chips(profile.keywords) },
    { label: "Topics", value: chips(profile.topics) },
  ],
  competitors: [
    {
      label: "Competitors",
      value:
        profile.competitors.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {profile.competitors.map((competitor) => (
              <li key={`${competitor.name}-${competitor.website ?? ""}`}>
                <span className="font-medium">{competitor.name}</span>
                {competitor.website && (
                  <>
                    {" · "}
                    <a
                      href={competitor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {competitor.website}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null,
    },
  ],
});

interface BrandProfileReviewProps {
  profile: BrandProfile;
  /** Shows an Edit button on each section. */
  onEdit?: (step: OnboardingStep) => void;
  disabled?: boolean;
}

function BrandProfileReview({ profile, onEdit, disabled = false }: BrandProfileReviewProps) {
  const sections = buildSections(profile);

  return (
    <div className="flex flex-col gap-4">
      {ONBOARDING_STEPS.map((step) => (
        <section
          key={step}
          aria-labelledby={`review-${step}`}
          className="rounded-lg border border-line p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 id={`review-${step}`} className="flex items-center gap-2 font-semibold">
              {ONBOARDING_STEP_INFO[step].title}
              {profile.onboarding.skippedSteps.includes(step) && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">
                  Skipped
                </span>
              )}
            </h3>
            {onEdit && (
              <Button
                variant="secondary"
                className="px-3 py-1.5"
                disabled={disabled}
                onClick={() => onEdit(step)}
                aria-label={`Edit ${ONBOARDING_STEP_INFO[step].title.toLowerCase()}`}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit
              </Button>
            )}
          </div>
          <dl className="mt-2 divide-y divide-line">
            {sections[step].map((item) => (
              <div key={item.label} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm text-muted">{item.label}</dt>
                <dd className="min-w-0 text-sm sm:col-span-2">
                  {item.value ??
                    (item.required ? (
                      <span className="font-medium text-red-700">Required</span>
                    ) : (
                      <span className="text-muted">Not provided</span>
                    ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export default BrandProfileReview;
