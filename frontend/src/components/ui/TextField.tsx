import { type ComponentProps, useId } from "react";
import { cn } from "@/lib/utils";

interface TextFieldProps extends ComponentProps<"input"> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Labelled input with accessible error/hint wiring. Works with react-hook-form's `register`.
 * Pass `required` to mark the label with an asterisk (forms using `noValidate` still validate via their schema).
 */
function TextField({ label, error, hint, id, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const description = error ?? hint;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
        {props.required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "rounded-md border border-line bg-surface px-3 py-2 text-sm transition-shadow outline-none placeholder:text-muted",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          error && "border-danger focus:border-danger focus:ring-danger/20",
        )}
        {...props}
      />
      {description && (
        <p id={descriptionId} className={cn("text-xs", error ? "text-red-700" : "text-muted")}>
          {description}
        </p>
      )}
    </div>
  );
}

export default TextField;
