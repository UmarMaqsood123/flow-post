import toast from "react-hot-toast";
import { getErrorMessage } from "./forms";

/**
 * Thin wrapper so every toast reads the same way. Pass an id when the same
 * action can fire repeatedly, so a new toast replaces the old one instead of stacking.
 */
export const notify = {
  success: (message: string, id?: string) => toast.success(message, id ? { id } : undefined),
  error: (error: unknown, fallback?: string, id?: string) =>
    toast.error(getErrorMessage(error, fallback), id ? { id } : undefined),
  info: (message: string, id?: string) => toast(message, id ? { id } : undefined),
  /** Something went wrong that the user didn't just trigger (a live notification). */
  alert: (message: string, id?: string) => toast.error(message, id ? { id } : undefined),
};
