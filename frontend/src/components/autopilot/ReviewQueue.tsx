import { Check, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { HOLD_REASON_TONES } from "@/config/autopilot";
import { platformLabel } from "@/config/post";
import { formatDateTime } from "@/lib/format";
import { dayKey, instantFromDayAndTime, timeKey } from "@/lib/timezone";
import { paths } from "@/routing/paths";
import { useApproveAutopilotPost, useRejectAutopilotPost } from "@/services/autopilot/useAutopilot";
import type { ReviewQueueItem } from "@/types/autopilot";
import { notify } from "@/lib/toast";

const MINUTE_MS = 60_000;

function QueueItem({
  item,
  workspaceId,
  timeZone,
  canDecide,
}: {
  item: ReviewQueueItem;
  workspaceId: string;
  timeZone: string;
  canDecide: boolean;
}) {
  const approve = useApproveAutopilotPost(workspaceId);
  const reject = useRejectAutopilotPost(workspaceId);
  // Read the clock once per item, so a re-render can't flip what's shown.
  const [openedAt] = useState(() => Date.now());
  const timePassed =
    !item.scheduledAt || new Date(item.scheduledAt).getTime() < openedAt + MINUTE_MS;
  const [newDay, setNewDay] = useState(() => dayKey(new Date(openedAt + 60 * MINUTE_MS), timeZone));
  const [newTime, setNewTime] = useState(() =>
    timeKey(new Date(openedAt + 60 * MINUTE_MS), timeZone),
  );
  const busy = approve.isPending || reject.isPending;

  const handleApprove = () => {
    approve.mutate(
      {
        postId: item.postId,
        scheduledAt: timePassed
          ? instantFromDayAndTime(newDay, newTime, timeZone).toISOString()
          : undefined,
      },
      {
        onSuccess: () => notify.success(`Approved and scheduled: ${item.topic}`),
        onError: (error) => notify.error(error, undefined, `review-${item.postId}`),
      },
    );
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge>{platformLabel(item.platform)}</Badge>
            {item.pillar && <span>{item.pillar}</span>}
            {item.scheduledAt && (
              <span>Planned for {formatDateTime(item.scheduledAt, timeZone)}</span>
            )}
          </p>
          <h3 className="mt-1 font-medium">{item.topic}</h3>
        </div>
        <Badge tone={HOLD_REASON_TONES[item.heldReason]}>{item.heldReasonLabel}</Badge>
      </div>

      {item.heldMessage && <p className="text-sm text-muted">{item.heldMessage}</p>}
      {item.preview && (
        <p className="line-clamp-3 text-sm whitespace-pre-line text-ink/90">{item.preview}</p>
      )}

      {canDecide && timePassed && (
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">New date</span>
            <input
              type="date"
              className="rounded-md border border-line bg-surface px-2 py-1.5"
              value={newDay}
              onChange={(event) => setNewDay(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Time</span>
            <input
              type="time"
              className="rounded-md border border-line bg-surface px-2 py-1.5"
              value={newTime}
              onChange={(event) => setNewTime(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canDecide && (
          <>
            <Button
              className="px-3 py-1.5 text-sm"
              isLoading={approve.isPending}
              disabled={busy}
              onClick={handleApprove}
            >
              {!approve.isPending && <Check className="size-4" aria-hidden="true" />}
              {timePassed ? "Approve for new time" : "Approve"}
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              isLoading={reject.isPending}
              disabled={busy}
              onClick={() =>
                reject.mutate(
                  { postId: item.postId },
                  {
                    onSuccess: () => notify.success("Rejected. The post is in your drafts."),
                    onError: (error) => notify.error(error, undefined, `review-${item.postId}`),
                  },
                )
              }
            >
              {!reject.isPending && <X className="size-4" aria-hidden="true" />}
              Reject
            </Button>
          </>
        )}
        <Link
          to={`${paths.aiCreate}?post=${encodeURIComponent(item.postId)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open in editor
        </Link>
      </div>
    </li>
  );
}

interface ReviewQueueProps {
  items: ReviewQueueItem[];
  workspaceId: string;
  timeZone: string;
  canDecide: boolean;
}

function ReviewQueue({ items, workspaceId, timeZone, canDecide }: ReviewQueueProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nothing is waiting for review.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <QueueItem
          key={item.postId}
          item={item}
          workspaceId={workspaceId}
          timeZone={timeZone}
          canDecide={canDecide}
        />
      ))}
    </ul>
  );
}

export default ReviewQueue;
