import { History, RotateCcw } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/format";
import type { PostVersion } from "@/types/post";

interface VersionHistoryProps {
  versions: PostVersion[];
  currentVersionId: string | undefined;
  canRestore: boolean;
  onRestore: (versionId: string) => void;
  restoringId: string | null;
}

/** Every generate, edit and refine is kept, so any earlier wording can come back. */
function VersionHistory({
  versions,
  currentVersionId,
  canRestore,
  onRestore,
  restoringId,
}: VersionHistoryProps) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <History className="size-4 text-muted" aria-hidden="true" />
        Version history
      </h3>
      <ol className="mt-4 flex flex-col gap-2">
        {versions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          return (
            <li
              key={version.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="text-muted tabular-nums">v{version.version}</span>
                  {version.label}
                  {isCurrent && <Badge tone="success">Current</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatRelativeTime(version.createdAt)}
                  {version.createdBy ? ` · ${version.createdBy.name}` : ""}
                  {version.generation ? "" : " · manual"}
                </p>
              </div>
              {canRestore && !isCurrent && (
                <Button
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => onRestore(version.id)}
                  isLoading={restoringId === version.id}
                >
                  {restoringId !== version.id && (
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  )}
                  Restore
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default VersionHistory;
