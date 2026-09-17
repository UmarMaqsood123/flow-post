import { z } from "zod";
import { ANALYTICS_RANGES, MAX_RANGE_DAYS, RANGE_DAYS } from "../constants/analytics.constant";
import { CREATE_PLATFORMS } from "../constants/post.constant";

const DAY_MS = 86_400_000;

const commaList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1))
    .optional();

/**
 * `range` picks a preset window; `custom` needs explicit `from`/`to` instants.
 * Everything is resolved to absolute instants here so the service never has to
 * guess what "7 days" meant.
 */
export const analyticsQuerySchema = z
  .object({
    range: z.enum(ANALYTICS_RANGES).default("30d"),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    platform: commaList(CREATE_PLATFORMS),
  })
  .transform((value, ctx) => {
    if (value.range !== "custom") {
      const to = new Date();
      return {
        platform: value.platform,
        range: value.range,
        from: new Date(to.getTime() - RANGE_DAYS[value.range] * DAY_MS),
        to,
      };
    }

    if (!value.from || !value.to) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "A custom range needs both from and to",
      });
      return z.NEVER;
    }
    const from = new Date(value.from);
    const to = new Date(value.to);
    if (from >= to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "from must be before to" });
      return z.NEVER;
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `A range can cover at most ${MAX_RANGE_DAYS} days`,
      });
      return z.NEVER;
    }
    return { platform: value.platform, range: value.range, from, to };
  });

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
