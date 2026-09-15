import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { BRAND_PROFILE_LIMITS as LIMITS } from "@/config/brandProfile";
import type { BrandProfileFormValues } from "@/schemas/brandProfile.schema";

function CompetitorsStep() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BrandProfileFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "competitors" });

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
          No competitors yet. Add a few, or skip this step.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <li
              key={field.id}
              className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
            >
              <TextField
                label="Name"
                error={errors.competitors?.[index]?.name?.message}
                {...register(`competitors.${index}.name`)}
              />
              <TextField
                label="Website (optional)"
                type="url"
                placeholder="https://"
                error={errors.competitors?.[index]?.website?.message}
                {...register(`competitors.${index}.website`)}
              />
              <Button
                variant="secondary"
                className="justify-self-start border-transparent px-2 text-muted hover:text-red-700 sm:mt-6"
                aria-label={`Remove competitor ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="sm:hidden">Remove</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={fields.length >= LIMITS.competitors}
          onClick={() => append({ name: "", website: "" })}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add competitor
        </Button>
        <span className="text-xs text-muted">
          {fields.length}/{LIMITS.competitors}
        </span>
      </div>
      {errors.competitors?.message && (
        <p className="text-xs text-red-700">{errors.competitors.message}</p>
      )}
    </div>
  );
}

export default CompetitorsStep;
