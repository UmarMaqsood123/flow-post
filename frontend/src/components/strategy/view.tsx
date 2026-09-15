import type { ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function Prose({ text, className }: { text: string; className?: string }) {
  return text ? (
    <p className={cn("text-sm leading-relaxed whitespace-pre-line", className)}>{text}</p>
  ) : (
    <EmptyNote>Not written yet.</EmptyNote>
  );
}

export function BulletList({ items, empty = "None" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm marker:text-muted">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function Chips({ labels, empty = "None" }: { labels: string[]; empty?: string }) {
  if (labels.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
    </div>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
