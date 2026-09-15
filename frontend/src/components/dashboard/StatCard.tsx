import { type LucideIcon, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import Skeleton from "@/components/ui/Skeleton";
import { percentChange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MetricWithChange } from "@/types/dashboard";

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  value?: ReactNode;
  /** Shows a trend against the previous period. */
  change?: MetricWithChange;
  hint?: string;
  /** Makes the whole card a link. */
  to?: string;
  isLoading?: boolean;
}

function Trend({ change }: { change: MetricWithChange }) {
  const percent = percentChange(change.value, change.previous);
  if (percent === null) return <p className="text-xs text-muted">No data for last month</p>;

  const rounded = Math.round(percent);
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus;
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        rounded > 0 && "text-green-700",
        rounded < 0 && "text-red-700",
        rounded === 0 && "text-muted",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {rounded > 0 ? "+" : ""}
      {rounded}%<span className="font-normal text-muted">vs last month</span>
    </p>
  );
}

const cardClass = "flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-4 sm:p-5";

function StatCard({
  label,
  icon: Icon,
  value,
  change,
  hint,
  to,
  isLoading = false,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm leading-5 font-medium text-muted">{label}</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      {isLoading ? (
        <>
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-4 w-32" />
        </>
      ) : (
        <>
          <p className="text-3xl font-semibold tracking-tight">{value ?? "—"}</p>
          {change ? (
            <Trend change={change} />
          ) : (
            hint && <p className="text-xs text-muted">{hint}</p>
          )}
        </>
      )}
    </>
  );

  if (to && !isLoading) {
    return (
      <Link
        to={to}
        className={cn(cardClass, "transition-shadow hover:shadow-md focus-visible:shadow-md")}
      >
        {content}
      </Link>
    );
  }
  return <div className={cardClass}>{content}</div>;
}

export default StatCard;
