import { RotateCcw } from "lucide-react";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { AUTOPILOT_FORMAT_OPTIONS, SLOT_STATUS_DETAILS } from "@/config/autopilot";
import { platformLabel } from "@/config/post";
import { formatDateTime } from "@/lib/format";
import { useRetryAutopilotSlot } from "@/services/autopilot/useAutopilot";
import type { AutopilotSlot } from "@/types/autopilot";
import { notify } from "@/lib/toast";

const formatLabel = (format: AutopilotSlot["format"]) =>
  AUTOPILOT_FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? null;

interface SlotListProps {
  slots: AutopilotSlot[];
  workspaceId: string;
  timeZone: string;
  canRetry: boolean;
}

function SlotList({ slots, workspaceId, timeZone, canRetry }: SlotListProps) {
  const retry = useRetryAutopilotSlot(workspaceId);
  // Slots too close to their time can't be retried; read the clock once per mount.
  const [retryCutoff] = useState(() => Date.now() + 30 * 60_000);

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted">
        No posting times planned. Autopilot plans the next week once it's running.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line">
        {slots.map((slot) => {
          const status = SLOT_STATUS_DETAILS[slot.status];
          const details = [slot.pillar, formatLabel(slot.format)].filter(Boolean).join(" · ");
          return (
            <li key={slot.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{formatDateTime(slot.scheduledAt, timeZone)}</p>
                <p className="mt-0.5 text-sm">
                  {slot.topic ?? <span className="text-muted">Topic not chosen yet</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {slot.platforms.map(platformLabel).join(", ")}
                  {details && ` · ${details}`}
                </p>
                {(slot.skipReason || slot.lastError) && (
                  <p className="mt-1 text-xs text-red-700">
                    {slot.skipReason ?? slot.lastError?.message}
                    {slot.status === "PLANNED" &&
                      slot.nextAttemptAt &&
                      ` Retrying ${formatDateTime(slot.nextAttemptAt, timeZone)}.`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                {canRetry &&
                  (slot.status === "FAILED" || slot.status === "SKIPPED") &&
                  new Date(slot.scheduledAt).getTime() > retryCutoff && (
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate(slot.id, {
                          onSuccess: () => notify.success("Posting time put back in line."),
                          onError: (error) => notify.error(error),
                        })
                      }
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Retry
                    </Button>
                  )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SlotList;
