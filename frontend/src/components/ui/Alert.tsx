import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  info: "border-primary/20 bg-primary/5 text-ink",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
} as const;

interface AlertProps {
  variant?: keyof typeof VARIANTS;
  title?: string;
  children?: ReactNode;
  className?: string;
}

function Alert({ variant = "info", title, children, className }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", VARIANTS[variant], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}

export default Alert;
