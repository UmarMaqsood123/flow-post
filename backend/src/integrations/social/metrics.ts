/** Helpers for turning provider payloads into normalized metrics. */

/**
 * A metric value, or undefined when the platform didn't report one. Platforms
 * send counts as strings as often as numbers, and a missing metric must stay
 * missing rather than becoming zero.
 */
export const count = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/** Drops the metrics a platform didn't report, so absent stays absent. */
export const definedMetrics = <T extends Record<string, number | undefined>>(
  metrics: T,
): Partial<T> =>
  Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
