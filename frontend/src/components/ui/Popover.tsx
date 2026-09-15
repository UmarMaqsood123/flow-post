import { type ReactNode, useCallback, useId, useRef, useState } from "react";
import useDismiss from "@/hooks/useDismiss";
import { cn } from "@/lib/utils";

interface PopoverProps {
  /** Accessible name of the trigger button. */
  label: string;
  buttonContent: ReactNode;
  buttonClassName?: string;
  panelClassName?: string;
  /** Which edge of the trigger the panel lines up with. */
  align?: "left" | "right";
  /** Panel content; call `close` after an item is chosen. */
  children: (close: () => void) => ReactNode;
}

/** Button that toggles a floating panel; closes on outside click or Escape. */
function Popover({
  label,
  buttonContent,
  buttonClassName,
  panelClassName,
  align = "right",
  children,
}: PopoverProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={buttonClassName}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            "absolute top-full z-50 mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-lg",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export default Popover;
