import type { ReactNode } from "react";
import { getErrorMessage } from "@/lib/forms";
import ErrorState from "./ErrorState";

interface AsyncContentProps {
  isLoading: boolean;
  /** Skeleton shown while loading. */
  loading: ReactNode;
  error?: unknown;
  errorTitle?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  isEmpty?: boolean;
  empty?: ReactNode;
  children: ReactNode;
}

/** Renders loading → error → empty → content, so every data view handles all four states. */
function AsyncContent({
  isLoading,
  loading,
  error,
  errorTitle = "We couldn't load this",
  onRetry,
  isRetrying,
  isEmpty = false,
  empty,
  children,
}: AsyncContentProps) {
  if (isLoading) {
    return (
      <div role="status">
        <span className="sr-only">Loading…</span>
        {loading}
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        compact
        title={errorTitle}
        message={getErrorMessage(error)}
        onRetry={onRetry}
        isRetrying={isRetrying}
      />
    );
  }
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}

export default AsyncContent;
