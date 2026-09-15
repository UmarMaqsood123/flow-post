import { Controller, useFormContext } from "react-hook-form";
import TagInput from "@/components/ui/TagInput";
import TextAreaField from "@/components/ui/TextAreaField";
import { BRAND_PROFILE_LIMITS as LIMITS } from "@/config/brandProfile";
import type { BrandProfileFormValues } from "@/schemas/brandProfile.schema";

function AudienceStep() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BrandProfileFormValues>();

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="productsServices"
        render={({ field, fieldState }) => (
          <TagInput
            ref={field.ref}
            label="Products or services"
            placeholder="e.g. Coffee subscriptions"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            maxItems={LIMITS.productsServices.items}
            maxLength={LIMITS.productsServices.length}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextAreaField
        label="Target audience"
        rows={3}
        placeholder="e.g. Home baristas aged 25–45 who care about where their coffee comes from"
        hint="Who are your ideal customers? Include roles, needs, interests or demographics."
        error={errors.targetAudience?.message}
        {...register("targetAudience")}
      />
      <Controller
        control={control}
        name="targetLocations"
        render={({ field, fieldState }) => (
          <TagInput
            ref={field.ref}
            label="Target locations"
            optional
            placeholder="e.g. Austin, TX or Worldwide"
            commaSeparates={false}
            hint="Countries, regions or cities. Press Enter after each one."
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            maxItems={LIMITS.targetLocations.items}
            maxLength={LIMITS.targetLocations.length}
            error={fieldState.error?.message}
          />
        )}
      />
    </div>
  );
}

export default AudienceStep;
