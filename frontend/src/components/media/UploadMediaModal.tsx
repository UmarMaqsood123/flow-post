import { FileText, Film, ImageIcon, X } from "lucide-react";
import { useState } from "react";
import Modal from "@/components/modals";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Dropzone from "@/components/ui/Dropzone";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import {
  ANY_FILE_ACCEPT,
  IMAGE_EXTENSIONS,
  MAX_FILES_PER_UPLOAD,
  MAX_UPLOAD_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  MEDIA_DESCRIPTION_MAX,
  MEDIA_NAME_MAX,
  VIDEO_EXTENSIONS,
} from "@/config/uploads";
import { formatFileSize, validateClientFile } from "@/lib/files";
import { getErrorMessage } from "@/lib/forms";
import useUploadFiles from "@/services/storage/useUploadFiles";

interface PendingFile {
  /** Stable key: the same file can be picked twice, so the name alone isn't enough. */
  key: string;
  file: File;
  name: string;
  description: string;
}

/** "IMG_0042.final.png" → "IMG_0042.final": a sensible starting name people can change. */
const nameFromFile = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, MEDIA_NAME_MAX);
};

const extensionOf = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

function FileIcon({ fileName }: { fileName: string }) {
  const extension = extensionOf(fileName);
  const Icon = (IMAGE_EXTENSIONS as readonly string[]).includes(extension)
    ? ImageIcon
    : (VIDEO_EXTENSIONS as readonly string[]).includes(extension)
      ? Film
      : FileText;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

interface UploadMediaModalProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  onUploaded: (count: number) => void;
}

/**
 * Pick one or more files, give each a name and an optional description, then
 * upload them together. The name starts as the file name so the quick path is
 * still just "choose files, press Upload".
 */
function UploadMediaModal({ open, workspaceId, onClose, onUploaded }: UploadMediaModalProps) {
  const upload = useUploadFiles(workspaceId);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const reset = () => {
    setPending([]);
    setError(null);
    setShowErrors(false);
    upload.reset();
  };

  const close = () => {
    if (upload.isUploading) return;
    reset();
    onClose();
  };

  const addFiles = (selected: File[]) => {
    setError(null);
    const room = MAX_FILES_PER_UPLOAD - pending.length;
    if (selected.length > room) {
      setError(`You can upload up to ${MAX_FILES_PER_UPLOAD} files at once.`);
      return;
    }
    for (const file of selected) {
      const problem = validateClientFile(file);
      if (problem) {
        setError(`${file.name}: ${problem}`);
        return;
      }
    }
    setPending((current) => [
      ...current,
      ...selected.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        name: nameFromFile(file.name),
        description: "",
      })),
    ]);
  };

  const update = (key: string, changes: Partial<Pick<PendingFile, "name" | "description">>) =>
    setPending((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );

  const remove = (key: string) =>
    setPending((current) => current.filter((item) => item.key !== key));

  const submit = async () => {
    setError(null);
    if (pending.some((item) => !item.name.trim())) {
      setShowErrors(true);
      return;
    }
    try {
      const uploaded = await upload.upload({
        files: pending.map((item) => item.file),
        details: pending.map((item) => ({
          name: item.name.trim(),
          description: item.description.trim() || undefined,
        })),
      });
      reset();
      onUploaded(uploaded.length);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, "Upload failed. Please try again."));
    }
  };

  const count = pending.length;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add media"
      description="Name each file so it's easy to find later. Descriptions are optional."
      size="lg"
      // An upload in flight would be lost by closing, so the modal stays put.
      dismissible={!upload.isUploading}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={upload.isUploading}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={count === 0}
            isLoading={upload.isUploading}
          >
            {count > 1 ? `Upload ${count} files` : "Upload"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {count < MAX_FILES_PER_UPLOAD && (
          <Dropzone
            multiple
            accept={ANY_FILE_ACCEPT}
            disabled={upload.isUploading}
            ariaLabel="Choose images, videos or documents"
            hint={`Images, videos, PDF, Word, Excel, PowerPoint, TXT or CSV · up to ${MAX_UPLOAD_SIZE_MB} MB each (videos ${MAX_VIDEO_SIZE_MB} MB), ${MAX_FILES_PER_UPLOAD} at a time`}
            invalid={Boolean(error)}
            onFiles={addFiles}
          />
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {count > 0 && (
          <ul className="flex flex-col gap-3">
            {pending.map((item) => {
              const nameMissing = showErrors && !item.name.trim();
              return (
                <li key={item.key} className="rounded-xl border border-line p-4">
                  <div className="flex items-center gap-3">
                    <FileIcon fileName={item.file.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="text-xs text-muted">{formatFileSize(item.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.key)}
                      disabled={upload.isUploading}
                      aria-label={`Remove ${item.file.name}`}
                      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-40"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col gap-3">
                    <TextField
                      label="Name"
                      value={item.name}
                      maxLength={MEDIA_NAME_MAX}
                      onChange={(event) => update(item.key, { name: event.target.value })}
                      error={nameMissing ? "Give this file a name" : undefined}
                      disabled={upload.isUploading}
                    />
                    <TextAreaField
                      label="Description (optional)"
                      rows={2}
                      value={item.description}
                      maxLength={MEDIA_DESCRIPTION_MAX}
                      placeholder="What it shows, where it's used, who took it…"
                      onChange={(event) => update(item.key, { description: event.target.value })}
                      disabled={upload.isUploading}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {upload.isUploading && upload.progress !== null && (
          <div className="flex items-center gap-3">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Uploading files"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={upload.progress}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${upload.progress}%` }}
              />
            </div>
            <span className="text-xs text-muted">{upload.progress}%</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default UploadMediaModal;
