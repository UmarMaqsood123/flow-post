import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsCardProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}

function SettingsCard({
  title,
  description,
  children,
  tone = "default",
  className,
}: SettingsCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border p-5 sm:p-6",
        tone === "danger" ? "border-red-200" : "border-line",
        className,
      )}
    >
      <h2 className={cn("font-semibold", tone === "danger" && "text-red-800")}>{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

export default SettingsCard;
