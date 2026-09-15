import { Controller, useFormContext } from "react-hook-form";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { BRAND_PROFILE_LIMITS as LIMITS } from "@/config/brandProfile";
import { WORKSPACE_INDUSTRIES } from "@/config/workspace";
import type { BrandProfileFormValues } from "@/schemas/brandProfile.schema";

const INDUSTRY_OPTIONS: DropdownOption[] = WORKSPACE_INDUSTRIES.map((industry) => ({
  name: industry,
  value: industry,
}));

function BusinessStep() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BrandProfileFormValues>();

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="Business name"
        autoComplete="organization"
        error={errors.businessName?.message}
        {...register("businessName")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Controller
          control={control}
          name="industry"
          render={({ field, fieldState }) => (
            <Dropdown
              ref={field.ref}
              label="Industry"
              placeholder="Select an industry"
              options={INDUSTRY_OPTIONS}
              selected={INDUSTRY_OPTIONS.find((option) => option.value === field.value) ?? null}
              onChange={(option) => field.onChange(option.value)}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <TextField
          label="Website (optional)"
          type="url"
          placeholder="https://example.com"
          error={errors.website?.message}
          {...register("website")}
        />
      </div>
      <TextAreaField
        label="Business description"
        rows={4}
        placeholder="What do you do, and what makes you different?"
        hint={`A few sentences, up to ${LIMITS.description} characters.`}
        error={errors.description?.message}
        {...register("description")}
      />
    </div>
  );
}

export default BusinessStep;
