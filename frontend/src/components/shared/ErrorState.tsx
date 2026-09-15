import { CircleAlert, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** Smaller, borderless version for use inside cards and menus. */
  compact?: boolean;
  className?: string;
}

function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  isRetrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "px-4 py-6" : "rounded-2xl border border-red-200 bg-red-50/40 px-6 py-12",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
        <CircleAlert className="size-5" aria-hidden="true" />
      </span>
      <p className={cn("mt-3 font-semibold", compact ? "text-sm" : "text-base")}>{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry} isLoading={isRetrying}>
          {!isRetrying && <RefreshCw className="size-4" aria-hidden="true" />}
          Try again
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
