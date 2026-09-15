import { Pencil } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { STRATEGY_SECTION_DETAILS } from "@/config/contentStrategy";
import { ApiError } from "@/lib/apiError";
import { getErrorMessage } from "@/lib/forms";
import type { StrategySectionKey } from "@/types/contentStrategy";
import type { ErrorAt } from "./fields";

/** What the strategy page passes to every section. */
export interface SectionProps<T> {
  value: T;
  canEdit: boolean;
  /** Shown instead of the Edit button when editing isn't allowed. */
  readOnlyReason?: string;
  /** Rejects with the API error when the save fails. */
  onSave: (value: T) => Promise<unknown>;
  /** Discards local edits and loads the latest version (after a conflict). */
  onReload: () => void;
}

interface StrategySectionProps<T> extends SectionProps<T> {
  section: StrategySectionKey;
  renderView: (value: T) => ReactNode;
  renderEditor: (editor: { value: T; onChange: (value: T) => void; errorAt: ErrorAt }) => ReactNode;
}

/** Splits API validation details into this section's field errors and everything else. */
const readValidationErrors = (error: unknown, section: StrategySectionKey) => {
  const fieldErrors: Record<string, string> = {};
  const otherMessages: string[] = [];
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return { fieldErrors, otherMessages };
  }
  const prefix = `sections.${section}`;
  for (const detail of error.details as unknown[]) {
    if (typeof detail !== "object" || detail === null) continue;
    const { path, message } = detail as { path?: unknown; message?: unknown };
    if (typeof message !== "string") continue;
    if (path === prefix) fieldErrors[""] ??= message;
    else if (typeof path === "string" && path.startsWith(`${prefix}.`)) {
      fieldErrors[path.slice(prefix.length + 1)] ??= message;
    } else {
      otherMessages.push(message);
    }
  }
  return { fieldErrors, otherMessages };
};

/**
 * A strategy section with a read view and an editor. Saving sends only this
 * section; the backend validates it and returns errors mapped to fields.
 */
function StrategySection<T>({
  section,
  value,
  canEdit,
  readOnlyReason,
  onSave,
  onReload,
  renderView,
  renderEditor,
}: StrategySectionProps<T>) {
  const { title, description } = STRATEGY_SECTION_DETAILS[section];
  const headingId = useId();
  const [draft, setDraft] = useState<T | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isConflict, setIsConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // After a rejected save, bring the first problem into view (it can be far above the buttons).
  useEffect(() => {
    const form = formRef.current;
    if (!form || Object.keys(fieldErrors).length === 0) return;
    const invalidField = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalidField) invalidField.focus();
    else form.querySelector('[data-field-error="true"]')?.scrollIntoView({ block: "center" });
  }, [fieldErrors]);

  const resetErrors = () => {
    setFieldErrors({});
    setFormErrors([]);
    setIsConflict(false);
  };

  const startEditing = () => {
    resetErrors();
    setDraft(structuredClone(value));
  };

  const cancel = () => {
    resetErrors();
    setDraft(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === null) return;
    resetErrors();
    setIsSaving(true);
    try {
      await onSave(draft);
      setDraft(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setIsConflict(true);
        setFormErrors([error.message]);
        return;
      }
      const { fieldErrors: errors, otherMessages } = readValidationErrors(error, section);
      setFieldErrors(errors);
      if (otherMessages.length > 0) setFormErrors(otherMessages);
      else if (Object.keys(errors).length > 0) {
        setFormErrors(["Some fields need attention. Fix them and save again."]);
      } else setFormErrors([getErrorMessage(error)]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      id={section}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        {draft === null && canEdit && (
          <Button variant="secondary" className="self-start px-3 py-1.5" onClick={startEditing}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
        )}
        {draft === null && !canEdit && readOnlyReason && (
          <p className="text-xs text-muted sm:max-w-56 sm:text-right">{readOnlyReason}</p>
        )}
      </div>

      <div className="mt-5">
        {draft === null ? (
          renderView(value)
        ) : (
          <form ref={formRef} onSubmit={save} noValidate className="flex flex-col gap-4">
            {renderEditor({
              value: draft,
              onChange: setDraft,
              errorAt: (path) => fieldErrors[path],
            })}
            {formErrors.length > 0 && (
              <Alert variant="error">
                {formErrors.length === 1 ? (
                  formErrors[0]
                ) : (
                  <ul className="list-disc space-y-1 pl-5">
                    {formErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                {isConflict && (
                  <Button
                    variant="secondary"
                    className="mt-3 px-3 py-1.5"
                    onClick={() => {
                      cancel();
                      onReload();
                    }}
                  >
                    Discard my changes and reload
                  </Button>
                )}
              </Alert>
            )}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" isLoading={isSaving}>
                Save {title.toLowerCase()}
              </Button>
              <Button variant="secondary" onClick={cancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export default StrategySection;
