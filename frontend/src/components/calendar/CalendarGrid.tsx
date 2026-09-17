import { useState } from "react";
import {
  addDaysToKey,
  formatDayKey,
  isSameMonth,
  monthGridKeys,
  WEEKDAY_LABELS,
  weekKeys,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/types/post";
import CalendarCard from "./CalendarCard";

export type CalendarView = "month" | "week";

interface CalendarGridProps {
  view: CalendarView;
  /** Any day inside the month or week being shown. */
  anchor: string;
  timeZone: string;
  today: string;
  itemsByDay: Map<string, CalendarItem[]>;
  selectedId: string | null;
  onSelectItem: (postId: string) => void;
  canEdit: boolean;
  /** Called when a card is dropped on a day. */
  onDropOnDay: (postId: string, dayKey: string) => void;
  draggingId: string | null;
  onDragStart: (postId: string) => void;
  onDragEnd: () => void;
}

/** Month (6 weeks) and week views share a day cell, so cards and drops behave the same. */
function CalendarGrid({
  view,
  anchor,
  timeZone,
  today,
  itemsByDay,
  selectedId,
  onSelectItem,
  canEdit,
  onDropOnDay,
  draggingId,
  onDragStart,
  onDragEnd,
}: CalendarGridProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const days = view === "month" ? monthGridKeys(anchor) : weekKeys(anchor);

  const handleDrop = (dayKey: string) => (event: React.DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const postId = event.dataTransfer.getData("text/plain") || draggingId;
    if (postId) onDropOnDay(postId, dayKey);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-slate-50 text-center">
        {WEEKDAY_LABELS.map((label, index) => (
          <div key={label} className="px-1 py-2 text-xs font-medium text-muted">
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 1)}</span>
            {view === "week" && (
              <span className="mt-0.5 block text-[11px] font-normal">
                {formatDayKey(days[index], { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className={cn("grid grid-cols-7", view === "month" ? "grid-rows-6" : "grid-rows-1")}>
        {days.map((dayKey) => {
          const items = itemsByDay.get(dayKey) ?? [];
          const isToday = dayKey === today;
          const outsideMonth = view === "month" && !isSameMonth(dayKey, anchor);
          return (
            <div
              key={dayKey}
              data-day={dayKey}
              onDragOver={(event) => {
                if (!canEdit || !draggingId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(dayKey);
              }}
              onDragLeave={() => setDropTarget((current) => (current === dayKey ? null : current))}
              onDrop={handleDrop(dayKey)}
              className={cn(
                "group flex min-h-28 flex-col gap-1 border-r border-b border-line p-1.5 last:border-r-0 sm:min-h-32",
                view === "week" && "min-h-[28rem]",
                outsideMonth && "bg-slate-50/60",
                dropTarget === dayKey && "bg-primary/5 ring-2 ring-primary/40 ring-inset",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday ? "bg-primary font-semibold text-white" : "text-muted",
                    outsideMonth && !isToday && "opacity-60",
                  )}
                >
                  {Number(dayKey.slice(8))}
                </span>
              </div>

              <div
                className={cn(
                  "flex flex-col gap-1 overflow-y-auto",
                  view === "month" ? "max-h-24 sm:max-h-28" : "max-h-[24rem]",
                )}
              >
                {items.map((item) => (
                  <CalendarCard
                    key={item.id}
                    item={item}
                    timeZone={timeZone}
                    isSelected={item.id === selectedId}
                    onSelect={onSelectItem}
                    canDrag={canEdit}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        Showing {formatDayKey(days[0], { day: "numeric", month: "long", year: "numeric" })} to{" "}
        {formatDayKey(addDaysToKey(days[days.length - 1], 0), {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

export default CalendarGrid;
