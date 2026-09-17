import { Inbox } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/types/post";
import CalendarCard from "./CalendarCard";

interface UnscheduledPaneProps {
  items: CalendarItem[];
  timeZone: string;
  selectedId: string | null;
  onSelectItem: (postId: string) => void;
  canEdit: boolean;
  /** Dropping a card here takes it off the calendar. */
  onDropUnschedule: (postId: string) => void;
  draggingId: string | null;
  onDragStart: (postId: string) => void;
  onDragEnd: () => void;
}

function UnscheduledPane({
  items,
  timeZone,
  selectedId,
  onSelectItem,
  canEdit,
  onDropUnschedule,
  draggingId,
  onDragStart,
  onDragEnd,
}: UnscheduledPaneProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section
      onDragOver={(event) => {
        if (!canEdit || !draggingId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        const postId = event.dataTransfer.getData("text/plain") || draggingId;
        if (postId) onDropUnschedule(postId);
      }}
      className={cn(
        "rounded-xl border border-line bg-surface p-4",
        isOver && "bg-primary/5 ring-2 ring-primary/40",
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Inbox className="size-4 text-muted" aria-hidden="true" />
        Unscheduled
        <span className="text-muted tabular-nums">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          {canEdit
            ? "Drag a post here to take it off the calendar."
            : "Nothing waiting to be scheduled."}
        </p>
      ) : (
        <div className="mt-3 flex max-h-96 flex-col gap-1.5 overflow-y-auto">
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
              showTime={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default UnscheduledPane;
