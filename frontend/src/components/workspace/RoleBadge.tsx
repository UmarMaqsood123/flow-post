import { ROLE_LABELS } from "@/config/workspace";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/types/workspace";

function RoleBadge({ role, className }: { role: WorkspaceRole; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        role === "OWNER" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-700",
        className,
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export default RoleBadge;
