import { z } from "zod";
import {
  INSIGHT_CATEGORIES,
  INSIGHT_STATUSES,
  MAX_INSIGHTS_PER_REPORT,
} from "../constants/insights.constant";
import { objectIdField } from "./common.validator";

/**
 * What the AI returns: interpretation and advice that cites calculated facts by
 * id. It carries no numbers; `insightsGuard` in the service rejects any that do.
 */
export const performanceInsightsOutputSchema = z.object({
  insights: z
    .array(
      z.object({
        category: z.enum(INSIGHT_CATEGORIES),
        title: z.string().max(120),
        interpretation: z.string().max(600),
        recommendation: z.string().max(400),
        factIds: z.array(z.string().max(200)).min(1).max(4),
      }),
    )
    .max(MAX_INSIGHTS_PER_REPORT),
});
export type PerformanceInsightsOutput = z.infer<typeof performanceInsightsOutputSchema>;

export const reportParamsSchema = z.object({ reportId: objectIdField });
export const insightParamsSchema = z.object({ reportId: objectIdField, insightId: objectIdField });

export const decideInsightSchema = z.object({
  status: z.enum(INSIGHT_STATUSES, { error: "Choose approved, dismissed or pending" }),
});

export type ReportParams = z.infer<typeof reportParamsSchema>;
export type InsightParams = z.infer<typeof insightParamsSchema>;
export type DecideInsightInput = z.infer<typeof decideInsightSchema>;
