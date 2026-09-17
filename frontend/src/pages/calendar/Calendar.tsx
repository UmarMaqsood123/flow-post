import { CalendarDays, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import CalendarFilters from "@/components/calendar/CalendarFilters";
import {
  type CalendarFilterState,
  countFilters,
  emptyFilters,
} from "@/components/calendar/filterState";
import CalendarGrid, { type CalendarView } from "@/components/calendar/CalendarGrid";
import PostDetailsPanel from "@/components/calendar/PostDetailsPanel";
import { DeleteModal } from "@/components/modals";
import { platformLabel } from "@/config/post";
import UnscheduledPane from "@/components/calendar/UnscheduledPane";
import ErrorState from "@/components/shared/ErrorState";
import PageHeader from "@/components/shared/PageHeader";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/forms";
import {
  addDaysToKey,
  addMonthsToKey,
  dayKey,
  formatDayKey,
  formatMonthTitle,
  instantFromDayAndTime,
  monthGridKeys,
  startOfMonthKey,
  timeKey,
  todayKey,
  weekKeys,
  zoneLabel,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import {
  useContentStrategies,
  useContentStrategy,
} from "@/services/contentStrategy/useContentStrategies";
import {
  useCalendar,
  useDeletePost,
  useDuplicatePost,
  usePost,
  usePostSchedule,
  useSchedulePost,
  useSetPostStatus,
  useUpdatePostDetails,
} from "@/services/posts/usePosts";
import { useSocialAccounts } from "@/services/socialAccounts/useSocialAccounts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { CalendarItem, ManualPostStatus } from "@/types/post";
import { notify } from "@/lib/toast";

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

function CalendarPage() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id ?? "";
  const timeZone = current?.workspace.timezone ?? "UTC";
  const [searchParams, setSearchParams] = useSearchParams();

  const today = todayKey(timeZone);
  const view: CalendarView = searchParams.get("view") === "week" ? "week" : "month";
  const anchor = searchParams.get("date") ?? today;
  const selectedId = searchParams.get("post");

  const [filters, setFilters] = useState<CalendarFilterState>(emptyFilters());
  const [showFilters, setShowFilters] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // The visible grid decides the range; instants are built in the workspace zone.
  const days = view === "month" ? monthGridKeys(anchor) : weekKeys(anchor);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  // Query keys are hashed by value, so a fresh object each render is fine.
  const query = {
    from: instantFromDayAndTime(firstDay, "00:00", timeZone).toISOString(),
    to: instantFromDayAndTime(addDaysToKey(lastDay, 1), "00:00", timeZone).toISOString(),
    platform: filters.platforms.length > 0 ? filters.platforms : undefined,
    status: filters.statuses.length > 0 ? filters.statuses : undefined,
    pillar: filters.pillars.length > 0 ? filters.pillars : undefined,
  };

  const calendar = useCalendar(workspaceId || undefined, workspaceId ? query : null);
  const detail = usePost(workspaceId || undefined, selectedId ?? undefined);
  const scheduleHistory = usePostSchedule(workspaceId || undefined, selectedId ?? undefined);
  const socialAccounts = useSocialAccounts(workspaceId || undefined);
  const strategies = useContentStrategies(workspaceId || undefined);
  const activeStrategyId = strategies.data?.find((item) => item.status === "ACTIVE")?.id;
  const activeStrategy = useContentStrategy(workspaceId || undefined, activeStrategyId);

  const schedulePost = useSchedulePost(workspaceId);
  const updateDetails = useUpdatePostDetails(workspaceId);
  const setStatus = useSetPostStatus(workspaceId);
  const duplicatePost = useDuplicatePost(workspaceId);
  const deletePost = useDeletePost(workspaceId);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;

  const canEdit = hasMinimumRole(current.role, "EDITOR");
  const items = calendar.data?.items ?? [];
  const unscheduled = calendar.data?.unscheduled ?? [];

  const itemsByDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    if (!item.scheduledAt) continue;
    const key = dayKey(new Date(item.scheduledAt), timeZone);
    itemsByDay.set(key, [...(itemsByDay.get(key) ?? []), item]);
  }

  const pillarOptions = [
    ...new Set([
      ...(activeStrategy.data?.content.contentPillars.map((pillar) => pillar.name) ?? []),
      ...[...items, ...unscheduled]
        .map((item) => item.pillar)
        .filter((p): p is string => Boolean(p)),
    ]),
  ];

  const setParams = (changes: Record<string, string | null>) => {
    setSearchParams(
      (params) => {
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) params.delete(key);
          else params.set(key, value);
        }
        return params;
      },
      { replace: true },
    );
  };

  const move = (direction: -1 | 1) =>
    setParams({
      date:
        view === "month"
          ? startOfMonthKey(addMonthsToKey(startOfMonthKey(anchor), direction))
          : addDaysToKey(anchor, direction * 7),
    });

  const title =
    view === "month"
      ? formatMonthTitle(anchor)
      : `${formatDayKey(days[0], { day: "numeric", month: "short" })} – ${formatDayKey(days[6], { day: "numeric", month: "short", year: "numeric" })}`;

  /**
   * Success always toasts. Errors toast only when there's no open panel to show
   * them (drag and drop, duplicating); otherwise the panel shows them inline.
   */
  const run = (promise: Promise<unknown>, message?: string, { toastError = false } = {}) => {
    promise
      .then(() => {
        if (message) notify.success(message, "calendar-action");
      })
      .catch((error: unknown) => {
        if (toastError) notify.error(error, undefined, "calendar-action");
      });
  };

  /** Dropping a card keeps its time of day and only changes the date. */
  const handleDropOnDay = (postId: string, targetDay: string) => {
    setDraggingId(null);
    const item = [...items, ...unscheduled].find((candidate) => candidate.id === postId);
    const time = item?.scheduledAt ? timeKey(new Date(item.scheduledAt), timeZone) : "09:00";
    run(
      schedulePost.mutateAsync({
        postId,
        scheduledAt: instantFromDayAndTime(targetDay, time, timeZone).toISOString(),
      }),
      undefined,
      { toastError: true },
    );
  };

  const post = detail.data?.post;
  // Only connected accounts on this post's platform can publish it.
  const accountsForPost = (socialAccounts.data ?? []).filter(
    (account) => account.platform === post?.platform && account.status === "CONNECTED",
  );
  const busy =
    schedulePost.isPending ||
    updateDetails.isPending ||
    setStatus.isPending ||
    duplicatePost.isPending ||
    deletePost.isPending;
  const panelError =
    schedulePost.error ?? updateDetails.error ?? setStatus.error ?? deletePost.error ?? null;

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Calendar"
        description={`What's going out and when, in ${timeZone.replaceAll("_", " ")} (${zoneLabel(timeZone)}).`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            className="px-2 py-1.5"
            aria-label={view === "month" ? "Previous month" : "Previous week"}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-sm"
            onClick={() => setParams({ date: today })}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            className="px-2 py-1.5"
            aria-label={view === "month" ? "Next month" : "Next week"}
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <h2 className="ml-2 text-base font-semibold sm:text-lg">{title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Calendar view"
            className="flex rounded-lg border border-line p-0.5"
          >
            {VIEWS.map((option) => (
              <button
                key={option.value}
                role="tab"
                type="button"
                aria-selected={view === option.value}
                onClick={() => setParams({ view: option.value })}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  view === option.value
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-sm"
            onClick={() => setShowFilters((open) => !open)}
          >
            <Filter className="size-4" aria-hidden="true" />
            Filters
            {countFilters(filters) > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs text-primary tabular-nums">
                {countFilters(filters)}
              </span>
            )}
          </Button>
        </div>
      </div>

      {showFilters && (
        <CalendarFilters
          filters={filters}
          onChange={setFilters}
          pillarOptions={pillarOptions}
          onClose={() => setShowFilters(false)}
        />
      )}

      {calendar.isError ? (
        <ErrorState
          title="We couldn't load the calendar"
          message={getErrorMessage(calendar.error)}
          onRetry={() => void calendar.refetch()}
          isRetrying={calendar.isRefetching}
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          {calendar.isPending ? (
            <div role="status">
              <span className="sr-only">Loading calendar…</span>
              <Skeleton className="h-[32rem] rounded-xl" />
            </div>
          ) : (
            <CalendarGrid
              view={view}
              anchor={anchor}
              timeZone={timeZone}
              today={today}
              itemsByDay={itemsByDay}
              selectedId={selectedId}
              onSelectItem={(postId) => setParams({ post: postId })}
              canEdit={canEdit}
              onDropOnDay={handleDropOnDay}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
            />
          )}

          <div className="flex flex-col gap-4">
            {selectedId && detail.isPending && <Skeleton className="h-64 rounded-xl" />}
            {selectedId && post && (
              <PostDetailsPanel
                key={post.id}
                post={post}
                timeZone={timeZone}
                canEdit={canEdit}
                pillarOptions={pillarOptions}
                accounts={accountsForPost}
                schedule={scheduleHistory.data}
                busy={busy}
                error={panelError}
                onClose={() => setParams({ post: null })}
                onStatusChange={(status: ManualPostStatus) =>
                  run(setStatus.mutateAsync({ postId: post.id, status }))
                }
                onSaveDetails={(details) =>
                  run(
                    updateDetails.mutateAsync({ postId: post.id, payload: details }),
                    "Post updated.",
                  )
                }
                onSchedule={(input) =>
                  run(
                    schedulePost.mutateAsync({ postId: post.id, ...input }),
                    "Scheduled. It publishes automatically.",
                  )
                }
                onUnschedule={() =>
                  run(
                    schedulePost.mutateAsync({ postId: post.id, scheduledAt: null }),
                    "Post taken off the calendar.",
                  )
                }
                onDuplicate={() =>
                  run(
                    duplicatePost.mutateAsync(post.id).then((copy) => setParams({ post: copy.id })),
                    "Post duplicated.",
                    { toastError: true },
                  )
                }
                onDelete={() => {
                  deletePost.reset();
                  setIsDeleteOpen(true);
                }}
              />
            )}
            {post && (
              <DeleteModal
                open={isDeleteOpen}
                itemName={`this ${platformLabel(post.platform)} post`}
                description={`"${post.brief.topic}" and all its versions will be removed.`}
                isDeleting={deletePost.isPending}
                error={deletePost.error}
                onConfirm={() =>
                  run(
                    deletePost.mutateAsync(post.id).then(() => {
                      setIsDeleteOpen(false);
                      setParams({ post: null });
                    }),
                    "Post deleted.",
                  )
                }
                onClose={() => setIsDeleteOpen(false)}
              />
            )}

            <UnscheduledPane
              items={unscheduled}
              timeZone={timeZone}
              selectedId={selectedId}
              onSelectItem={(postId) => setParams({ post: postId })}
              canEdit={canEdit}
              onDropUnschedule={(postId) => {
                setDraggingId(null);
                run(schedulePost.mutateAsync({ postId, scheduledAt: null }), undefined, {
                  toastError: true,
                });
              }}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
            />

            {items.length === 0 && unscheduled.length === 0 && !calendar.isPending && (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
                <CalendarDays className="mx-auto size-6 text-muted" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">Nothing planned here yet</p>
                <p className="mt-1 text-xs text-muted">
                  {canEdit
                    ? "Add a post to a day, or write drafts in AI Create and schedule them."
                    : "An editor can plan posts here."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
