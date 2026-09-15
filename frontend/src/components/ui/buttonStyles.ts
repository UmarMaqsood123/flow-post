import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-primary/60",
  secondary: "border border-line bg-surface text-ink hover:bg-slate-50 disabled:text-muted",
  danger:
    "border border-danger/30 bg-surface text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-surface",
  link: "p-0 font-medium text-primary hover:underline",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

/** Shared so links can look like buttons (`<Link className={buttonStyles("secondary")}>`). */
export const buttonStyles = (variant: ButtonVariant = "primary", className?: string) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed",
    VARIANTS[variant],
    className,
  );
