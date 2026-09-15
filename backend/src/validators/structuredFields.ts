import { z } from "zod";

/**
 * Field builders shared by schemas that are both AI output and user input:
 * - "input" validates what people type, with clear messages and hard limits.
 * - "ai" is the structured-output schema. Models can't be held to lengths and
 *   counts, so values are clipped instead of rejected; the result is validated
 *   again in "input" mode before it's stored.
 */
export type Mode = "input" | "ai";

export const formatNumber = (value: number) => value.toLocaleString("en-US");

export const text = (
  mode: Mode,
  label: string,
  max: number,
  required = false,
): z.ZodType<string> => {
  if (mode === "ai") return z.string().transform((value) => value.trim().slice(0, max));
  const schema = z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${formatNumber(max)} characters`);
  return required ? schema.min(1, `${label} is required`) : schema;
};

/** Optional text stored as null when empty. */
export const nullableText = (mode: Mode, label: string, max: number): z.ZodType<string | null> => {
  const clean = (value: string | null) => {
    const trimmed = (value ?? "").trim().slice(0, max);
    return trimmed || null;
  };
  if (mode === "ai") return z.string().nullable().transform(clean);
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${formatNumber(max)} characters`)
    .nullable()
    .transform(clean);
};

export const wholeNumber = (mode: Mode, label: string, max: number): z.ZodType<number> =>
  mode === "ai"
    ? z
        .number()
        .transform((value) =>
          Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0,
        )
    : z
        .number({ error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(0, `${label} can't be negative`)
        .max(max, `${label} must be at most ${formatNumber(max)}`);

export interface ListOptions<T> {
  /** Items to drop (e.g. blank entries). */
  keep?: (item: T) => boolean;
  /** Items must be unique by this key: rejected in input mode, de-duplicated in AI mode. */
  uniqueBy?: (item: T) => string;
  uniqueMessage?: string;
}

export const list = <T>(
  mode: Mode,
  label: string,
  item: z.ZodType<T>,
  max: number,
  { keep, uniqueBy, uniqueMessage }: ListOptions<T> = {},
): z.ZodType<T[]> => {
  if (mode === "ai") {
    return z.array(item).transform((items) => {
      const seen = new Set<string>();
      return items
        .filter((value) => {
          if (keep && !keep(value)) return false;
          if (!uniqueBy) return true;
          const key = uniqueBy(value);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, max);
    });
  }
  return z
    .array(item, { error: `${label} must be a list` })
    .max(max, `Add up to ${max} ${label}`)
    .superRefine((items, ctx) => {
      if (!uniqueBy) return;
      const seen = new Set<string>();
      items.forEach((value, index) => {
        const key = uniqueBy(value);
        if (seen.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: uniqueMessage ?? `Each item in ${label} must be unique`,
          });
        }
        seen.add(key);
      });
    })
    .transform((items) => (keep ? items.filter(keep) : items));
};

export const enumList = <T extends string>(
  mode: Mode,
  label: string,
  values: readonly [T, ...T[]],
  max: number,
): z.ZodType<T[]> => {
  const item = z.enum(values as unknown as [T, ...T[]], {
    error: `Choose from the available ${label}`,
  }) as unknown as z.ZodType<T>;
  const unique = (items: T[]) => [...new Set(items)];
  return mode === "ai"
    ? z.array(item).transform((items) => unique(items).slice(0, max))
    : z
        .array(item, { error: `${label} must be a list` })
        .max(max, `Choose up to ${max} ${label}`)
        .transform(unique);
};
