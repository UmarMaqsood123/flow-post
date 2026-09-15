import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface WidgetCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Header action, e.g. a "View all" link. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Titled dashboard card. Pair with AsyncContent for loading, error and empty states. */
function WidgetCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  children,
}: WidgetCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col rounded-xl border border-line bg-surface", className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className="truncate font-semibold">
              {title}
            </h2>
            {description && <p className="truncate text-xs text-muted">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default WidgetCard;
