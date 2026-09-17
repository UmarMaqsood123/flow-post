import { useState } from "react";
import AsyncContent from "@/components/shared/AsyncContent";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { EVENT_DETAILS } from "@/config/autopilot";
import { platformLabel } from "@/config/post";
import { formatDateTime } from "@/lib/format";
import { useAutopilotEvents } from "@/services/autopilot/useAutopilot";
import { AUTOPILOT_EVENT_TYPES, type AutopilotEventType } from "@/types/autopilot";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";

const TYPE_OPTIONS: DropdownOption<AutopilotEventType | "">[] = [
  { value: "", name: "All activity" },
  ...AUTOPILOT_EVENT_TYPES.map((value) => ({ value, name: EVENT_DETAILS[value].label })),
];

interface ActivityLogProps {
  workspaceId: string;
  timeZone: string;
}

/** The audit trail: every decision, by a person or by Autopilot, newest first. */
function ActivityLog({ workspaceId, timeZone }: ActivityLogProps) {
  const [type, setType] = useState<AutopilotEventType | "">("");
  const events = useAutopilotEvents(workspaceId, type || undefined);
  const items = events.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Dropdown<AutopilotEventType | "">
        label="Show"
        className="max-w-xs"
        options={TYPE_OPTIONS}
        selected={TYPE_OPTIONS.find((option) => option.value === type) ?? TYPE_OPTIONS[0]}
        onChange={(option) => setType(option.value)}
      />

      <AsyncContent
        isLoading={events.isPending}
        loading={<Skeleton className="h-40 rounded-lg" />}
        error={events.isError ? events.error : undefined}
        errorTitle="We couldn't load activity"
        onRetry={() => void events.refetch()}
        isRetrying={events.isRefetching}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {items.map((event) => {
              const details = EVENT_DETAILS[event.type];
              return (
                <li key={event.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
                  <time
                    dateTime={event.createdAt}
                    className="shrink-0 text-xs text-muted tabular-nums sm:w-36"
                  >
                    {formatDateTime(event.createdAt, timeZone)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone={details.tone}>{details.label}</Badge>
                      {event.platform && (
                        <span className="text-muted">{platformLabel(event.platform)}</span>
                      )}
                      <span className="text-muted">
                        {event.actor ? `by ${event.actor.name}` : "by Autopilot"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm break-words">{event.message}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {events.hasNextPage && (
          <Button
            variant="secondary"
            className="self-start"
            isLoading={events.isFetchingNextPage}
            onClick={() => void events.fetchNextPage()}
          >
            Load older activity
          </Button>
        )}
      </AsyncContent>
    </div>
  );
}

export default ActivityLog;
