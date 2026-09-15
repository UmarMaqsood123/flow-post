import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface BaseProps<T extends string> {
  label: string;
  options: ChoiceOption<T>[];
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** "cards" shows descriptions in a grid; "chips" is a compact wrapping row. */
  layout?: "cards" | "chips";
  onBlur?: () => void;
  className?: string;
}

type ChoiceGroupProps<T extends string> = BaseProps<T> &
  (
    | { multiple?: false; value: T | ""; onChange: (value: T) => void; maxSelected?: never }
    | { multiple: true; value: T[]; onChange: (value: T[]) => void; maxSelected?: number }
  );

/** Radio (single) or checkbox (multiple) group rendered as selectable cards or chips. */
function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const {
    label,
    options,
    hint,
    error,
    disabled = false,
    layout = "cards",
    onBlur,
    className,
  } = props;
  const id = useId();
  const descriptionId = `${id}-description`;
  const selected: T[] = props.multiple ? props.value : props.value ? [props.value] : [];
  const atLimit =
    props.multiple && props.maxSelected !== undefined && selected.length >= props.maxSelected;
  const description = error ?? hint;

  const toggle = (value: T) => {
    if (!props.multiple) {
      props.onChange(value);
      return;
    }
    props.onChange(
      selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
    );
  };

  return (
    <fieldset
      className={cn("min-w-0", className)}
      aria-describedby={description ? descriptionId : undefined}
    >
      <legend className="mb-2 text-sm font-medium">
        {label}
        {props.multiple && props.maxSelected !== undefined && (
          <span className="font-normal text-muted"> · choose up to {props.maxSelected}</span>
        )}
      </legend>
      <div className={layout === "cards" ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const optionDisabled = disabled || (atLimit && !checked);
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex cursor-pointer gap-3 border bg-surface text-sm transition-colors",
                "has-focus-visible:ring-2 has-focus-visible:ring-primary/30",
                layout === "cards"
                  ? "items-start rounded-lg p-3"
                  : "items-center rounded-full px-3 py-1.5",
                checked ? "border-primary bg-primary/5" : "border-line hover:border-slate-300",
                error && !checked && "border-danger/40",
                optionDisabled && "cursor-not-allowed opacity-50 hover:border-line",
              )}
            >
              <input
                type={props.multiple ? "checkbox" : "radio"}
                name={id}
                value={option.value}
                checked={checked}
                disabled={optionDisabled}
                aria-invalid={error ? true : undefined}
                onChange={() => toggle(option.value)}
                onBlur={onBlur}
                className="sr-only"
              />
              {layout === "cards" ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                    props.multiple ? "rounded" : "rounded-full",
                    checked ? "border-primary bg-primary text-white" : "border-slate-300",
                  )}
                >
                  {checked && <Check className="size-3" strokeWidth={3} />}
                </span>
              ) : (
                checked && <Check aria-hidden="true" className="-ml-0.5 size-3.5 text-primary" />
              )}
              <span className="min-w-0">
                <span className={cn("block font-medium", checked && "text-primary")}>
                  {option.label}
                </span>
                {layout === "cards" && option.description && (
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {description && (
        <p id={descriptionId} className={cn("mt-2 text-xs", error ? "text-red-700" : "text-muted")}>
          {description}
        </p>
      )}
    </fieldset>
  );
}

export default ChoiceGroup;
