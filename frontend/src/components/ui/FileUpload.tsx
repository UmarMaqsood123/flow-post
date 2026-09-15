import { FileText, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { ANY_FILE_ACCEPT, IMAGE_ACCEPT } from "@/config/uploads";
import { formatFileSize, validateClientFile } from "@/lib/files";
import { getErrorMessage } from "@/lib/forms";
import useUploadFile from "@/services/storage/useUploadFile";
import type { UploadedFile } from "@/types/file";
import Button from "./Button";
import Dropzone from "./Dropzone";

interface FileUploadProps {
  workspaceId: string;
  label: string;
  /** Current file URL, e.g. a saved logo. */
  value: string | null;
  /** Called with the new URL after a successful upload, or null when removed. */
  onChange: (url: string | null, file?: UploadedFile) => void;
  /** `image` restricts to images and shows a thumbnail. */
  variant?: "image" | "file";
  hint?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Single-file upload field (the flow-post equivalent of jobs-viewer's
 * `SingleFileUpload`): uploads immediately and reports the stored URL.
 */
function FileUpload({
  workspaceId,
  label,
  value,
  onChange,
  variant = "file",
  hint,
  error,
  disabled = false,
}: FileUploadProps) {
  const labelId = useId();
  const descriptionId = useId();
  const replaceRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadedFile | null>(null);
  const { upload, isUploading, progress } = useUploadFile(workspaceId);

  const imagesOnly = variant === "image";
  const accept = imagesOnly ? IMAGE_ACCEPT : ANY_FILE_ACCEPT;
  const shownError = localError ?? error;
  const currentUpload = lastUpload?.url === value ? lastUpload : null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    const problem = validateClientFile(file, { imagesOnly });
    if (problem) {
      setLocalError(problem);
      return;
    }
    try {
      const uploaded = await upload(file);
      setLastUpload(uploaded);
      onChange(uploaded.url, uploaded);
    } catch (uploadError) {
      setLocalError(getErrorMessage(uploadError, "Upload failed. Please try again."));
    }
  };

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-line p-3">
          {imagesOnly ? (
            <img
              src={value}
              alt={`Current ${label.toLowerCase()}`}
              referrerPolicy="no-referrer"
              className="size-14 shrink-0 rounded-md border border-line bg-slate-50 object-cover"
            />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {currentUpload?.name ?? (imagesOnly ? "Current image" : "Uploaded file")}
            </p>
            {currentUpload && (
              <p className="text-xs text-muted">{formatFileSize(currentUpload.size)}</p>
            )}
          </div>
          <Button
            variant="secondary"
            className="px-3 py-1.5"
            disabled={disabled || isUploading}
            isLoading={isUploading}
            onClick={() => replaceRef.current?.click()}
          >
            Replace
          </Button>
          <Button
            variant="secondary"
            className="px-2.5 py-1.5"
            disabled={disabled || isUploading}
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => {
              setLastUpload(null);
              onChange(null);
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
          <input
            ref={replaceRef}
            type="file"
            accept={accept}
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      ) : (
        <Dropzone
          accept={accept}
          disabled={disabled || isUploading}
          ariaLabel={`Upload ${label.toLowerCase()}`}
          hint={hint}
          invalid={Boolean(shownError)}
          describedBy={shownError ? descriptionId : undefined}
          onFiles={([file]) => void handleFile(file)}
        />
      )}

      {isUploading && progress !== null && (
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label={`Uploading ${label.toLowerCase()}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted">{progress}%</span>
        </div>
      )}

      {shownError && (
        <p id={descriptionId} role="alert" className="text-xs text-red-700">
          {shownError}
        </p>
      )}
      {!shownError && value && hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default FileUpload;
