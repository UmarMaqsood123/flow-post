import { Controller, useFormContext } from "react-hook-form";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import {
  BRAND_GOAL_OPTIONS,
  POSTING_FREQUENCY_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
} from "@/config/brandProfile";
import type { BrandProfileFormValues } from "@/schemas/brandProfile.schema";
import type { BrandGoal, SocialPlatform } from "@/types/brandProfile";

const FREQUENCY_OPTIONS: DropdownOption[] = POSTING_FREQUENCY_OPTIONS.map((option) => ({
  name: option.label,
  value: option.value,
  description: option.description,
}));

function GoalsStep() {
  const { control } = useFormContext<BrandProfileFormValues>();

  return (
    <div className="flex flex-col gap-6">
      <Controller
        control={control}
        name="primaryGoal"
        render={({ field, fieldState }) => (
          <ChoiceGroup<BrandGoal>
            label="Primary goal"
            options={BRAND_GOAL_OPTIONS}
            value={field.value as BrandGoal | ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="preferredPlatforms"
        render={({ field, fieldState }) => (
          <ChoiceGroup<SocialPlatform>
            multiple
            layout="chips"
            label="Preferred platforms"
            hint="Where you want to publish. You'll connect accounts later."
            options={SOCIAL_PLATFORM_OPTIONS}
            value={field.value as SocialPlatform[]}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="postingFrequency"
        render={({ field, fieldState }) => (
          <Dropdown
            ref={field.ref}
            label="Posting frequency"
            hint="How often you'd like to post on each platform."
            placeholder="Select a frequency"
            options={FREQUENCY_OPTIONS}
            selected={FREQUENCY_OPTIONS.find((option) => option.value === field.value) ?? null}
            onChange={(option) => field.onChange(option.value)}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            className="sm:max-w-xs"
          />
        )}
      />
    </div>
  );
}

export default GoalsStep;
