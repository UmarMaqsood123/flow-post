import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts (`px-2` + `px-4` → `px-4`). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
