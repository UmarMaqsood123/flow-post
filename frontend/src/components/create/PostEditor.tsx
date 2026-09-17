import { useEffect, useState } from "react";
import { TextListField } from "@/components/strategy/fields";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import {
  FIELD_LABELS,
  PLATFORM_FIELDS,
  PLATFORM_TEXT_LABELS,
  PLATFORM_TEXT_LIMITS,
  POST_LIMITS as LIMITS,
} from "@/config/post";
import { ApiError } from "@/lib/apiError";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import type { CreatePlatform, PostContent } from "@/types/post";

/** Maps API details like `content.hashtags.0` onto the editor's fields. */
const readFieldErrors = (error: unknown) => {
  const fieldErrors: Record<string, string> = {};
  const otherMessages: string[] = [];
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return { fieldErrors, otherMessages };
  }
  for (const detail of error.details as unknown[]) {
    if (typeof detail !== "object" || detail === null) continue;
    const { path, message } = detail as { path?: unknown; message?: unknown };
    if (typeof message !== "string") continue;
    if (typeof path === "string" && path.startsWith("content.")) {
      fieldErrors[path.slice("content.".length)] ??= message;
    } else {
      otherMessages.push(message);
    }
  }
  return { fieldErrors, otherMessages };
};

interface Edits {
  /** Edits belong to one version; a newer version discards them. */
  versionId: string;
  draft: PostContent;
}

interface Problems {
  versionId: string;
  fieldErrors: Record<string, string>;
  formErrors: string[];
}

interface PostEditorProps {
  platform: CreatePlatform;
  /** The current version's content. */
  content: PostContent;
  versionId: string;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: PostContent) => Promise<unknown>;
}

function PostEditor({
  platform,
  content,
  versionId,
  canEdit,
  onDirtyChange,
  onSave,
}: PostEditorProps) {
  const [edits, setEdits] = useState<Edits | null>(null);
  const [problems, setProblems] = useState<Problems | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Generate, refine and restore all create a new version, which replaces the editor's content.
  const draft = edits?.versionId === versionId ? edits.draft : content;
  const { fieldErrors, formErrors }: Omit<Problems, "versionId"> =
    problems?.versionId === versionId ? problems : { fieldErrors: {}, formErrors: [] };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(content);
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const update = (changes: Partial<PostContent>) =>
    setEdits({ versionId, draft: { ...draft, ...changes } });
  const fields = PLATFORM_FIELDS[platform];
  const textLimit = PLATFORM_TEXT_LIMITS[platform];
  const textLength = [...draft.text].length;

  const save = async () => {
    setIsSaving(true);
    setProblems(null);
    try {
      await onSave(draft);
      setEdits(null);
    } catch (error) {
      const { fieldErrors: errors, otherMessages } = readFieldErrors(error);
      const messages =
        otherMessages.length > 0
          ? otherMessages
          : Object.keys(errors).length > 0
            ? ["Some fields need attention. Fix them and save again."]
            : [getErrorMessage(error)];
      setProblems({ versionId, fieldErrors: errors, formErrors: messages });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Content</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            {isDirty && <span className="text-xs text-muted">Unsaved changes</span>}
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              onClick={() => setEdits(null)}
              disabled={!isDirty || isSaving}
            >
              Reset
            </Button>
            <Button
              className="px-3 py-1.5 text-sm"
              onClick={save}
              isLoading={isSaving}
              disabled={!isDirty}
            >
              Save as new version
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {fields.includes("title") && (
          <TextField
            label={FIELD_LABELS.title}
            maxLength={LIMITS.title}
            value={draft.title ?? ""}
            onChange={(event) => update({ title: event.target.value })}
            error={fieldErrors.title}
            disabled={!canEdit}
          />
        )}
        {fields.includes("hook") && (
          <TextAreaField
            label={FIELD_LABELS.hook}
            rows={2}
            maxLength={LIMITS.hook}
            value={draft.hook ?? ""}
            onChange={(event) => update({ hook: event.target.value })}
            error={fieldErrors.hook}
            disabled={!canEdit}
          />
        )}
        {fields.includes("body") && (
          <TextAreaField
            label={FIELD_LABELS.body}
            rows={6}
            maxLength={LIMITS.body}
            value={draft.body ?? ""}
            onChange={(event) => update({ body: event.target.value })}
            error={fieldErrors.body}
            disabled={!canEdit}
          />
        )}
        {fields.includes("cta") && (
          <TextField
            label={FIELD_LABELS.cta}
            maxLength={LIMITS.cta}
            value={draft.cta ?? ""}
            onChange={(event) => update({ cta: event.target.value })}
            error={fieldErrors.cta}
            disabled={!canEdit}
          />
        )}

        <div>
          <TextAreaField
            label={PLATFORM_TEXT_LABELS[platform]}
            hint="This is what gets published."
            rows={10}
            maxLength={LIMITS.text}
            value={draft.text}
            onChange={(event) => update({ text: event.target.value })}
            error={fieldErrors.text}
            disabled={!canEdit}
          />
          <p
            className={cn(
              "mt-1 text-right text-xs tabular-nums",
              textLength > textLimit ? "font-medium text-red-700" : "text-muted",
            )}
          >
            {textLength.toLocaleString()} / {textLimit.toLocaleString()} characters
          </p>
        </div>

        {fields.includes("hashtags") && (
          <TextListField
            label={FIELD_LABELS.hashtags}
            value={draft.hashtags}
            onChange={(hashtags) => update({ hashtags })}
            max={LIMITS.hashtags}
            maxLength={LIMITS.hashtag}
            commaSeparates
            hint="Spaces and symbols are removed when you save."
            error={fieldErrors.hashtags}
          />
        )}

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
          </Alert>
        )}
      </div>
    </section>
  );
}

export default PostEditor;
