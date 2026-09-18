import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { BRAND_GOAL_OPTIONS, BRAND_TONE_OPTIONS } from "@/config/brandProfile";
import { CREATE_PLATFORM_OPTIONS, POST_LIMITS as LIMITS } from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import type { BrandGoal, BrandTone } from "@/types/brandProfile";
import type { CreatePlatform, GeneratePostsPayload } from "@/types/post";

const goalOptions: DropdownOption[] = [
  { name: "Use the brand profile's goal", value: "" },
  ...BRAND_GOAL_OPTIONS.map((option) => ({ name: option.label, value: option.value })),
];
const toneOptions: DropdownOption[] = [
  { name: "Use the brand voice", value: "" },
  ...BRAND_TONE_OPTIONS.map((option) => ({ name: option.label, value: option.value })),
];

interface BriefFormProps {
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (payload: GeneratePostsPayload) => void;
  onCancel?: () => void;
}

/** Topic, goal, platforms, tone and optional instructions — one brief, one post per platform. */
function BriefForm({ isSubmitting, error, onSubmit, onCancel }: BriefFormProps) {
  const [topic, setTopic] = useState("");
  const [platforms, setPlatforms] = useState<CreatePlatform[]>(["LINKEDIN", "INSTAGRAM"]);
  const [goal, setGoal] = useState("");
  const [tone, setTone] = useState("");
  const [instructions, setInstructions] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const topicError = showErrors && !topic.trim() ? "Tell FlowPost what to write about" : undefined;
  const platformsError = showErrors && platforms.length === 0 ? "Choose at least one" : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!topic.trim() || platforms.length === 0) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      topic: topic.trim(),
      platforms,
      goal: (goal || undefined) as BrandGoal | undefined,
      tone: (tone || undefined) as BrandTone | undefined,
      instructions: instructions.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <TextField
        label="Topic"
        placeholder="e.g. Why grind size matters more than your machine"
        maxLength={LIMITS.topic}
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        error={topicError}
        disabled={isSubmitting}
      />
      <ChoiceGroup
        label="Platforms"
        multiple
        options={CREATE_PLATFORM_OPTIONS}
        value={platforms}
        onChange={setPlatforms}
        hint="Each platform gets its own version, never the same post twice."
        error={platformsError}
        disabled={isSubmitting}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Dropdown
          label="Goal"
          options={goalOptions}
          selected={goalOptions.find((option) => option.value === goal) ?? null}
          onChange={(option) => setGoal(option.value)}
          disabled={isSubmitting}
        />
        <Dropdown
          label="Tone"
          options={toneOptions}
          selected={toneOptions.find((option) => option.value === tone) ?? null}
          onChange={(option) => setTone(option.value)}
          disabled={isSubmitting}
        />
      </div>
      <TextAreaField
        label="Instructions (optional)"
        placeholder="e.g. Mention the subscription and keep it beginner-friendly"
        rows={2}
        maxLength={LIMITS.instructions}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        disabled={isSubmitting}
      />

      {Boolean(error) && !isSubmitting && (
        <Alert variant="error">
          {getErrorMessage(error, "We couldn't write these posts. Please try again.")}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" isLoading={isSubmitting}>
          {!isSubmitting && <Sparkles className="size-4" aria-hidden="true" />}
          {isSubmitting ? "Writing…" : "Generate posts"}
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

export default BriefForm;
