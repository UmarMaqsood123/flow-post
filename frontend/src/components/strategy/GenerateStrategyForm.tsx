import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import {
  optionLabel,
  STRATEGY_LIMITS as LIMITS,
  TIMEFRAME_OPTIONS,
} from "@/config/contentStrategy";
import { getErrorMessage } from "@/lib/forms";
import type { SocialPlatform } from "@/types/brandProfile";
import type { StrategyTimeframe } from "@/types/contentStrategy";

export interface StrategyFormValues {
  name: string;
  timeframe: StrategyTimeframe;
  platforms: SocialPlatform[];
  focus: string;
  instructions: string;
}

interface GenerateStrategyFormProps {
  /** "regenerate" asks what to change and hides the name. */
  mode: "generate" | "regenerate";
  defaults: Pick<StrategyFormValues, "timeframe" | "platforms" | "focus">;
  preferredPlatforms: SocialPlatform[];
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (values: StrategyFormValues) => void;
  onCancel?: () => void;
}

function GenerateStrategyForm({
  mode,
  defaults,
  preferredPlatforms,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: GenerateStrategyFormProps) {
  const [values, setValues] = useState<StrategyFormValues>({
    name: "",
    instructions: "",
    ...defaults,
  });
  const set = <K extends keyof StrategyFormValues>(key: K, value: StrategyFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const platformHint =
    preferredPlatforms.length > 0
      ? `Leave empty to use the brand profile's platforms: ${preferredPlatforms
          .map((platform) => optionLabel(SOCIAL_PLATFORM_OPTIONS, platform))
          .join(", ")}.`
      : "Leave empty to let FlowPost suggest platforms.";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {mode === "generate" && (
        <TextField
          label="Name (optional)"
          placeholder="e.g. Autumn launch"
          maxLength={LIMITS.name}
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          disabled={isSubmitting}
        />
      )}
      <ChoiceGroup
        label="Timeframe"
        layout="chips"
        options={TIMEFRAME_OPTIONS}
        value={values.timeframe}
        onChange={(timeframe) => set("timeframe", timeframe)}
        disabled={isSubmitting}
      />
      <ChoiceGroup
        label="Platforms"
        layout="chips"
        multiple
        options={SOCIAL_PLATFORM_OPTIONS}
        value={values.platforms}
        onChange={(platforms) => set("platforms", platforms)}
        hint={platformHint}
        disabled={isSubmitting}
      />
      <TextAreaField
        label="Focus (optional)"
        placeholder="e.g. Grow subscriptions ahead of the holiday season"
        rows={2}
        maxLength={LIMITS.instructions}
        value={values.focus}
        onChange={(event) => set("focus", event.target.value)}
        disabled={isSubmitting}
      />
      {mode === "regenerate" && (
        <TextAreaField
          label="What should change? (optional)"
          placeholder="e.g. More short videos and fewer text posts"
          rows={2}
          maxLength={LIMITS.instructions}
          value={values.instructions}
          onChange={(event) => set("instructions", event.target.value)}
          hint="A new version is created. The current version stays as it is."
          disabled={isSubmitting}
        />
      )}

      {Boolean(error) && !isSubmitting && (
        <Alert variant="error">
          {getErrorMessage(error, "We couldn't generate the strategy. Please try again.")}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" isLoading={isSubmitting}>
          {!isSubmitting && <Sparkles className="size-4" aria-hidden="true" />}
          {isSubmitting
            ? "Generating…"
            : mode === "generate"
              ? "Generate strategy"
              : "Generate new version"}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default GenerateStrategyForm;
