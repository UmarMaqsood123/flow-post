import { X } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, type Ref, useId, useState } from "react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  /** Wire to react-hook-form's `field.onBlur`. */
  onBlur?: () => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number;
  /** Also add items on comma. Turn off for values that contain commas, like "Austin, TX". */
  commaSeparates?: boolean;
  optional?: boolean;
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Free-text list entry. Enter adds an item, Backspace in the empty box removes
 * the last one, and pasted lists are split into items. Duplicates are ignored.
 */
function TagInput({
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  placeholder,
  maxItems,
  maxLength,
  commaSeparates = true,
  optional = false,
  disabled = false,
  ref,
}: TagInputProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const descriptionId = `${id}-description`;
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const isFull = maxItems !== undefined && value.length >= maxItems;
  const separator = commaSeparates ? /[,\n]/ : /\n/;
  const defaultHint = commaSeparates ? "Press Enter or comma to add." : "Press Enter to add.";
  const description = error ?? notice ?? hint ?? defaultHint;

  const addItems = (items: string[]) => {
    const next = [...value];
    const seen = new Set(value.map((item) => item.toLocaleLowerCase()));
    for (const raw of items) {
      const item = raw.trim().slice(0, maxLength);
      if (!item || seen.has(item.toLocaleLowerCase())) continue;
      if (maxItems !== undefined && next.length >= maxItems) {
        setNotice(`You can add up to ${maxItems}.`);
        break;
      }
      seen.add(item.toLocaleLowerCase());
      next.push(item);
    }
    if (next.length !== value.length) onChange(next);
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    addItems([draft]);
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || (commaSeparates && event.key === ",")) {
      // Enter must not submit the surrounding form.
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
      setNotice(null);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!separator.test(text)) return;
    event.preventDefault();
    addItems(text.split(separator));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 transition-shadow",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          error && "border-danger focus-within:border-danger focus-within:ring-danger/20",
          disabled && "bg-slate-50",
        )}
      >
        {value.length > 0 && (
          <ul aria-label={label} className="contents">
            {value.map((item, index) => (
              <li
                key={item}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-sm text-primary"
              >
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${item}`}
                  onClick={() => {
                    onChange(value.filter((_, itemIndex) => itemIndex !== index));
                    setNotice(null);
                  }}
                  className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-primary/15"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={ref}
          id={inputId}
          type="text"
          value={draft}
          maxLength={maxLength}
          disabled={disabled || isFull}
          placeholder={isFull ? undefined : placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          onChange={(event) => {
            setDraft(event.target.value);
            setNotice(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            commitDraft();
            onBlur?.();
          }}
          className="min-w-28 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted"
        />
      </div>
      <p
        id={descriptionId}
        className={cn("flex justify-between gap-3 text-xs", error ? "text-red-700" : "text-muted")}
      >
        <span>{description}</span>
        {maxItems !== undefined && (
          <span className="shrink-0 text-muted" aria-hidden="true">
            {value.length}/{maxItems}
          </span>
        )}
      </p>
    </div>
  );
}

export default TagInput;
