/** Returns the server's validation message for a path inside a section, e.g. "0.name". */
export type ErrorAt = (path: string) => string | undefined;

/** Scopes errors to a nested path: `nestErrors(errorAt, "segments")("0.name")` reads "segments.0.name". */
export const nestErrors =
  (errorAt: ErrorAt, prefix: string | number): ErrorAt =>
  (path) =>
    errorAt(path ? `${prefix}.${path}` : String(prefix));
