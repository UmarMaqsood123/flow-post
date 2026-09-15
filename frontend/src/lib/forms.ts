import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./apiError";

interface FieldErrorDetail {
  path: string;
  message: string;
}

const isFieldErrorDetail = (value: unknown): value is FieldErrorDetail =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as FieldErrorDetail).path === "string" &&
  typeof (value as FieldErrorDetail).message === "string";

/** Nested paths such as `competitors.0.name` belong to their top-level field. */
const belongsToField = (path: string, fields: readonly string[]) =>
  fields.some((field) => path === field || path.startsWith(`${field}.`));

/**
 * Maps API validation details (`error.details: [{ path, message }]`) onto form
 * fields. Returns true when at least one field error was applied.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return false;

  let applied = false;
  for (const detail of error.details) {
    if (isFieldErrorDetail(detail) && belongsToField(detail.path, fields)) {
      setError(detail.path as Path<T>, { type: "server", message: detail.message });
      applied = true;
    }
  }
  return applied;
}

export const getErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string => (error instanceof ApiError ? error.message : fallback);
