import { POST_STATUS_DETAILS, platformLabel } from "@/config/post";
import { formatTimeInZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/types/post";

interface CalendarCardProps {
  item: CalendarItem;
  timeZone: string;
  isSelected: boolean;
  onSelect: (postId: string) => void;
  /** Editors can drag cards to another day. */
  canDrag: boolean;
  onDragStart: (postId: string) => void;
  onDragEnd: () => void;
  /** The backlog has no time to show. */
  showTime?: boolean;
}

function CalendarCard({
  item,
  timeZone,
  isSelected,
  onSelect,
  canDrag,
  onDragStart,
  onDragEnd,
  showTime = true,
}: CalendarCardProps) {
  const status = POST_STATUS_DETAILS[item.status];
  const time = item.scheduledAt ? formatTimeInZone(item.scheduledAt, timeZone) : null;

  return (
    <button
      type="button"
      draggable={canDrag}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(item.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(item.id)}
      aria-current={isSelected ? "true" : undefined}
      title={`${platformLabel(item.platform)} · ${status.label}${time ? ` · ${time}` : ""}\n${item.topic}`}
      className={cn(
        "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
        canDrag && "cursor-grab active:cursor-grabbing",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-line bg-surface hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden="true" />
        {showTime && time && (
          <span className="text-[11px] font-medium text-muted tabular-nums">{time}</span>
        )}
        <span className="truncate text-[11px] font-medium text-muted">
          {platformLabel(item.platform)}
        </span>
      </span>
      <span className="mt-0.5 line-clamp-2 block text-xs leading-snug">{item.topic}</span>
      <span className="sr-only">
        {status.label}
        {item.pillar ? `, pillar ${item.pillar}` : ""}
      </span>
    </button>
  );
}

export default CalendarCard;
