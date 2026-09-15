import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: string;
  /** Makes the whole card a link. */
  to?: string;
}

const cardClass = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-5";

function StatCardContent({ label, value, icon: Icon, hint }: Omit<StatCardProps, "to">) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </>
  );
}

function StatCard({ to, ...props }: StatCardProps) {
  if (to) {
    return (
      <Link
        to={to}
        className={cn(cardClass, "transition-shadow hover:shadow-md focus-visible:shadow-md")}
      >
        <StatCardContent {...props} />
      </Link>
    );
  }
  return (
    <div className={cardClass}>
      <StatCardContent {...props} />
    </div>
  );
}

export default StatCard;
