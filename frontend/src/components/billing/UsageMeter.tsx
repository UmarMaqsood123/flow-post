import { cn } from "@/lib/utils";

interface UsageMeterProps {
  label: string;
  used: number;
  max: number;
  format?: (value: number) => string;
}

/** A labelled bar that turns amber near the limit and red at it. */
function UsageMeter({
  label,
  used,
  max,
  format = (value) => value.toLocaleString(),
}: UsageMeterProps) {
  const ratio = max > 0 ? Math.min(1, used / max) : 1;
  const tone = ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="text-muted tabular-nums">
          {format(used)} of {format(max)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        className="h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export default UsageMeter;
