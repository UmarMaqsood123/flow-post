import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { ONBOARDING_POSITIONS, ONBOARDING_STEP_INFO, OPTIONAL_STEPS } from "@/config/brandProfile";
import { ApiError } from "@/lib/apiError";
import {
  canVisitPosition,
  getOnboardingProgress,
  isMissingField,
  isOnboardingPosition,
  isStepDone,
  resumePosition,
  stepHasChanges,
  toFormValues,
  toPayload,
  toStepPayload,
  withoutBlankCompetitors,
} from "@/lib/brandProfile";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import {
  BRAND_PROFILE_FORM_FIELDS,
  ONBOARDING_STEP_FIELDS,
  onboardingSchemaFor,
} from "@/schemas/brandProfile.schema";
import {
  useCompleteOnboarding,
  useSaveOnboardingStep,
  useUpdateBrandProfile,
} from "@/services/brandProfile/useBrandProfileMutations";
import type {
  BrandProfile,
  MissingField,
  OnboardingPosition,
  OnboardingStep,
} from "@/types/brandProfile";
import BrandProfileReview from "./BrandProfileReview";
import OnboardingProgress from "./OnboardingProgress";
import AudienceStep from "./steps/AudienceStep";
import BusinessStep from "./steps/BusinessStep";
import CompetitorsStep from "./steps/CompetitorsStep";
import GoalsStep from "./steps/GoalsStep";
import VoiceStep from "./steps/VoiceStep";

const STEP_COMPONENTS: Record<OnboardingStep, ComponentType> = {
  business: BusinessStep,
  audience: AudienceStep,
  goals: GoalsStep,
  voice: VoiceStep,
  competitors: CompetitorsStep,
};

interface OnboardingWizardProps {
  workspaceId: string;
  /** The saved profile from the query cache; updated after every save. */
  profile: BrandProfile;
}

/**
 * Multi-step brand onboarding. The current step lives in the URL (`?step=`), so
 * Back/Forward work. "Save and continue" validates and saves one step; Previous,
 * the step list and "Save and exit" save a draft; the review screen completes it.
 */
function OnboardingWizard({ workspaceId, profile }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("step");
  const position: OnboardingPosition =
    isOnboardingPosition(requested) && canVisitPosition(profile, requested)
      ? requested
      : resumePosition(profile);

  // Validate only the visible step. Errors appear on "Save and continue" and then update as the
  // user types — validating on blur would shift the buttons between mousedown and click.
  const resolver = useMemo(() => zodResolver(onboardingSchemaFor(position)), [position]);
  const form = useForm({
    resolver,
    defaultValues: toFormValues(profile),
    reValidateMode: "onChange",
  });
  const updateProfile = useUpdateBrandProfile(workspaceId);
  const saveStep = useSaveOnboardingStep(workspaceId);
  const completeOnboarding = useCompleteOnboarding(workspaceId);
  const [formError, setFormError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [justCompleted, setJustCompleted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const positionIndex = ONBOARDING_POSITIONS.indexOf(position);
  const isCompleted = profile.onboarding.status === "COMPLETED";
  const isBusy = updateProfile.isPending || saveStep.isPending || completeOnboarding.isPending;
  const { percent } = getOnboardingProgress(profile);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  const shownPosition = useRef(position);
  useEffect(() => {
    if (shownPosition.current === position) return;
    shownPosition.current = position;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [position]);

  const clearMessages = () => {
    setFormError(null);
    setMissingFields([]);
  };

  const goTo = (next: OnboardingPosition) => {
    clearMessages();
    setSearchParams({ step: next });
  };

  const showError = (error: unknown) => {
    applyServerFieldErrors(error, form.setError, BRAND_PROFILE_FORM_FIELDS);
    setFormError(getErrorMessage(error));
    if (error instanceof ApiError && Array.isArray(error.details)) {
      setMissingFields(error.details.filter(isMissingField));
    }
  };

  /** Saves every field as a draft, without required-field checks. */
  const saveDraft = async (currentStep?: OnboardingPosition) => {
    clearMessages();
    try {
      const saved = await updateProfile.mutateAsync({
        ...toPayload(form.getValues()),
        ...(currentStep ? { currentStep } : {}),
      });
      form.reset(toFormValues(saved));
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  };

  /** Leaves the current step, saving a draft first if it has unsaved changes. */
  const leaveTo = async (target: OnboardingPosition) => {
    if (target === position) return;
    if (
      position !== "review" &&
      stepHasChanges(form.getValues(), profile, position) &&
      !(await saveDraft())
    ) {
      return;
    }
    goTo(target);
  };

  /** Runs after the step passed client-side validation. */
  const handleContinue = async (step: OnboardingStep) => {
    try {
      const saved = await saveStep.mutateAsync({
        step,
        payload: toStepPayload(form.getValues(), step),
      });
      form.reset(toFormValues(saved));
      goTo(saved.onboarding.currentStep);
    } catch (error) {
      showError(error);
    }
  };

  const handleSkip = async (step: OnboardingStep) => {
    clearMessages();
    try {
      const saved = await saveStep.mutateAsync({ step, payload: { skipped: true } });
      // Skipping discards unsaved edits on this step.
      const savedValues = toFormValues(saved);
      for (const field of ONBOARDING_STEP_FIELDS[step]) {
        form.resetField(field, { defaultValue: savedValues[field] as never });
      }
      goTo(saved.onboarding.currentStep);
    } catch (error) {
      showError(error);
    }
  };

  const handleFinish = async () => {
    clearMessages();
    try {
      await completeOnboarding.mutateAsync();
      setJustCompleted(true);
    } catch (error) {
      showError(error);
    }
  };

  const handleSaveAndExit = async () => {
    if (await saveDraft(position)) navigate(paths.dashboard);
  };

  const info = ONBOARDING_STEP_INFO[position];
  const StepComponent = position === "review" ? null : STEP_COMPONENTS[position];
  const canSkip = position !== "review" && OPTIONAL_STEPS.includes(position);
  const previous = ONBOARDING_POSITIONS[positionIndex - 1];

  return (
    <div className="flex flex-col gap-6">
      <OnboardingProgress
        current={position}
        percent={percent}
        isDone={(item) => item !== "review" && isStepDone(profile, item)}
        canVisit={(item) => canVisitPosition(profile, item)}
        onSelect={(item) => void leaveTo(item)}
        disabled={isBusy}
      />

      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (isBusy) return;
            clearMessages();
            if (position === "review") {
              if (!isCompleted) void handleFinish();
              return;
            }
            const step = position;
            if (step === "competitors") {
              form.setValue("competitors", withoutBlankCompetitors(form.getValues("competitors")));
            }
            void form.handleSubmit(
              () => handleContinue(step),
              () => setFormError("Please fix the highlighted fields to continue."),
            )(event);
          }}
          className="rounded-xl border border-line bg-surface p-5 sm:p-8"
        >
          <div className="mb-6">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {position === "review"
                ? "Final step"
                : `Step ${positionIndex + 1} of ${ONBOARDING_POSITIONS.length}`}
            </p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold outline-none">
              {info.heading}
            </h2>
            <p className="mt-1 text-sm text-muted">{info.description}</p>
          </div>

          {formError && (
            <Alert variant="error" className="mb-5">
              {formError}
              {missingFields.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {missingFields.map((field) => (
                    <li key={field.path}>
                      <button
                        type="button"
                        className="cursor-pointer text-left underline"
                        onClick={() => goTo(field.step)}
                      >
                        {ONBOARDING_STEP_INFO[field.step].title}: {field.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          {justCompleted && (
            <Alert variant="success" title="Your brand profile is complete" className="mb-5">
              You can come back and edit it any time.{" "}
              <Link to={paths.dashboard} className="font-medium underline">
                Go to the dashboard
              </Link>
            </Alert>
          )}

          {StepComponent ? (
            <fieldset disabled={isBusy} className="min-w-0">
              <StepComponent />
            </fieldset>
          ) : (
            <BrandProfileReview profile={profile} onEdit={goTo} disabled={isBusy} />
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {previous && (
                <Button
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void leaveTo(previous)}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Previous
                </Button>
              )}
              {!isCompleted && position !== "review" && (
                <Button
                  variant="secondary"
                  className="border-transparent"
                  disabled={isBusy}
                  isLoading={updateProfile.isPending}
                  onClick={() => void handleSaveAndExit()}
                >
                  Save and exit
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {canSkip && (
                <Button
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void handleSkip(position)}
                >
                  Skip this step
                </Button>
              )}
              {position !== "review" ? (
                <Button type="submit" disabled={isBusy} isLoading={saveStep.isPending}>
                  {isCompleted ? "Save and review" : "Save and continue"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              ) : isCompleted ? (
                <Link to={paths.dashboard} className={buttonStyles("primary")}>
                  Done
                </Link>
              ) : (
                <Button type="submit" disabled={isBusy} isLoading={completeOnboarding.isPending}>
                  {!completeOnboarding.isPending && (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  Finish setup
                </Button>
              )}
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}

export default OnboardingWizard;
