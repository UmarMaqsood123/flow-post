import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import FileUpload from "@/components/ui/FileUpload";
import { MAX_UPLOAD_SIZE_MB } from "@/config/uploads";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { getTimeZones, WORKSPACE_INDUSTRIES } from "@/config/workspace";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import {
  WORKSPACE_FORM_FIELDS,
  type WorkspaceFormValues,
  workspaceSchema,
} from "@/schemas/workspace.schema";

interface WorkspaceFormProps {
  defaultValues: WorkspaceFormValues;
  submitLabel: string;
  onSubmit: (values: WorkspaceFormValues) => Promise<unknown>;
  /** Disable all fields and hide the submit button (e.g. for editors and viewers). */
  readOnly?: boolean;
  /** Keep the submit button disabled until something changes. */
  requireChanges?: boolean;
  successMessage?: string;
  /** Enables logo upload. Omitted when creating a workspace (it doesn't exist yet). */
  workspaceId?: string;
}

const INDUSTRY_OPTIONS: DropdownOption[] = [
  { name: "Not specified", value: "" },
  ...WORKSPACE_INDUSTRIES.map((industry) => ({ name: industry, value: industry })),
];

function WorkspaceForm({
  defaultValues,
  submitLabel,
  onSubmit,
  readOnly = false,
  requireChanges = false,
  successMessage,
  workspaceId,
}: WorkspaceFormProps) {
  const timeZoneOptions = useMemo<DropdownOption[]>(
    () =>
      getTimeZones(defaultValues.timezone).map((zone) => ({
        name: zone.replaceAll("_", " "),
        value: zone,
      })),
    [defaultValues.timezone],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(workspaceSchema), defaultValues });

  const fieldsDisabled = readOnly || isSubmitting;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await onSubmit(values);
      reset(values);
      setSaved(true);
    } catch (error) {
      if (!applyServerFieldErrors(error, setError, WORKSPACE_FORM_FIELDS)) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && <Alert variant="error">{formError}</Alert>}
      {saved && successMessage && <Alert variant="success">{successMessage}</Alert>}

      <fieldset disabled={fieldsDisabled} className="flex min-w-0 flex-col gap-5">
        <TextField
          label="Workspace name"
          autoComplete="organization"
          error={errors.name?.message}
          {...register("name")}
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
                selected={
                  INDUSTRY_OPTIONS.find((option) => option.value && option.value === field.value) ??
                  null
                }
                onChange={(option) => field.onChange(option.value)}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                disabled={fieldsDisabled}
              />
            )}
          />

          <Controller
            control={control}
            name="timezone"
            render={({ field, fieldState }) => (
              <Dropdown
                ref={field.ref}
                label="Time zone"
                hint="Used when scheduling posts."
                placeholder="Select a time zone"
                searchable
                searchPlaceholder="Search time zones…"
                options={timeZoneOptions}
                selected={timeZoneOptions.find((option) => option.value === field.value) ?? null}
                onChange={(option) => field.onChange(option.value)}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                disabled={fieldsDisabled}
              />
            )}
          />
        </div>

        <TextField
          label="Website"
          type="url"
          placeholder="https://example.com"
          error={errors.website?.message}
          {...register("website")}
        />
        {workspaceId && (
          <Controller
            control={control}
            name="logo"
            render={({ field, fieldState }) => (
              <FileUpload
                workspaceId={workspaceId}
                label="Logo"
                variant="image"
                hint={`Square JPG, PNG, GIF or WebP, up to ${MAX_UPLOAD_SIZE_MB} MB.`}
                value={field.value || null}
                onChange={(url) => field.onChange(url ?? "")}
                error={fieldState.error?.message}
                disabled={fieldsDisabled}
              />
            )}
          />
        )}
        <TextAreaField
          label="Description"
          rows={3}
          hint="Optional. What does this brand do and who is it for?"
          error={errors.description?.message}
          {...register("description")}
        />
      </fieldset>

      {!readOnly && (
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={requireChanges && !isDirty}
          className="self-start"
        >
          {submitLabel}
        </Button>
      )}
    </form>
  );
}

export default WorkspaceForm;
