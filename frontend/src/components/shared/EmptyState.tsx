import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Smaller, borderless version for use inside cards and menus. */
  compact?: boolean;
  className?: string;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const Heading = compact ? "h3" : "h2";
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-4 py-6" : "rounded-2xl border border-dashed border-line px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-slate-100 text-muted",
          compact ? "size-10" : "size-12",
        )}
      >
        <Icon className={compact ? "size-5" : "size-6"} aria-hidden="true" />
      </span>
      <Heading className={cn("font-semibold", compact ? "mt-3 text-sm" : "mt-4 text-lg")}>
        {title}
      </Heading>
      {description && (
        <p className={cn("mt-1 max-w-sm text-muted", compact ? "text-xs" : "text-sm")}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
