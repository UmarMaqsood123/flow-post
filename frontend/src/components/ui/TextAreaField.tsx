import { type ComponentProps, useId } from "react";
import { cn } from "@/lib/utils";

interface TextAreaFieldProps extends ComponentProps<"textarea"> {
  label: string;
  error?: string;
  hint?: string;
}

function TextAreaField({ label, error, hint, id, className, ...props }: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = `${fieldId}-description`;
  const description = error ?? hint;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "rounded-md border border-line bg-surface px-3 py-2 text-sm transition-shadow outline-none placeholder:text-muted",
          "focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-muted",
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

export default TextAreaField;
