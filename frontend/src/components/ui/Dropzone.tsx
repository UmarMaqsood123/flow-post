import { UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Secondary line, e.g. allowed types and size. */
  hint?: string;
  /** Accessible label when there's no visible label pointing at the input. */
  ariaLabel?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/** Click-to-browse or drag-and-drop area. Keyboard accessible (it's a button). */
function Dropzone({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  hint,
  ariaLabel = "Upload files",
  invalid = false,
  describedBy,
  className,
}: DropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const emit = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) emit(event.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-60",
          dragging
            ? "border-primary bg-primary/5"
            : "border-line hover:border-primary/50 hover:bg-slate-50",
          invalid && "border-danger",
          className,
        )}
      >
        <UploadCloud className="size-6 text-muted" aria-hidden="true" />
        <span className="text-sm font-medium text-primary">
          Click to upload <span className="font-normal text-muted">or drag and drop</span>
        </span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          emit(event.target.files);
          // Allow choosing the same file again after an error.
          event.target.value = "";
        }}
      />
    </>
  );
}

export default Dropzone;
