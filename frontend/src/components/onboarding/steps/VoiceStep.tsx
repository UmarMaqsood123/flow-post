import { Controller, useFormContext } from "react-hook-form";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import TagInput from "@/components/ui/TagInput";
import TextAreaField from "@/components/ui/TextAreaField";
import { BRAND_PROFILE_LIMITS as LIMITS, BRAND_TONE_OPTIONS } from "@/config/brandProfile";
import type { BrandProfileFormValues } from "@/schemas/brandProfile.schema";
import type { BrandTone } from "@/types/brandProfile";

function VoiceStep() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BrandProfileFormValues>();

  return (
    <div className="flex flex-col gap-6">
      <Controller
        control={control}
        name="brandVoice.tones"
        render={({ field, fieldState }) => (
          <ChoiceGroup<BrandTone>
            multiple
            layout="chips"
            label="Tone"
            maxSelected={LIMITS.tones}
            options={BRAND_TONE_OPTIONS}
            value={field.value as BrandTone[]}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextAreaField
        label="Voice notes (optional)"
        rows={3}
        placeholder="e.g. Warm but never cheesy. Avoid jargon. Emoji are fine on Instagram."
        hint="Words to use or avoid, how formal to be, or brands whose voice you admire."
        error={errors.brandVoice?.notes?.message}
        {...register("brandVoice.notes")}
      />
      <Controller
        control={control}
        name="keywords"
        render={({ field, fieldState }) => (
          <TagInput
            ref={field.ref}
            label="Keywords"
            optional
            placeholder="e.g. specialty coffee"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            maxItems={LIMITS.keywords.items}
            maxLength={LIMITS.keywords.length}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="topics"
        render={({ field, fieldState }) => (
          <TagInput
            ref={field.ref}
            label="Topics"
            optional
            placeholder="e.g. brewing tips"
            hint="Themes you want to post about regularly."
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            maxItems={LIMITS.topics.items}
            maxLength={LIMITS.topics.length}
            error={fieldState.error?.message}
          />
        )}
      />
    </div>
  );
}

export default VoiceStep;
