import { z } from "zod";
import {
  AUTOPILOT_EVENT_TYPES,
  AUTOPILOT_FORMAT_VALUES,
  AUTOPILOT_LIMITS as LIMITS,
  AUTOPILOT_RULES,
  AUTOPILOT_WEEKDAYS,
} from "../constants/autopilot.constant";
import { CREATE_PLATFORMS } from "../constants/post.constant";
import { objectIdField } from "./common.validator";

/** What the topic prompt returns: a few candidates, so a repeat doesn't cost another call. */
export const autopilotTopicsOutputSchema = z.object({
  topics: z
    .array(
      z.object({
        topic: z.string().max(200),
        angle: z.string().max(300),
      }),
    )
    .max(AUTOPILOT_RULES.topicCandidates + 2),
});
export type AutopilotTopicsOutput = z.infer<typeof autopilotTopicsOutputSchema>;

const unique = <T>(items: T[]) => new Set(items).size === items.length;

export const updateAutopilotSettingsSchema = z
  .object({
    platforms: z
      .array(z.enum(CREATE_PLATFORMS))
      .min(1, "Choose at least one platform")
      .refine(unique, "Each platform can only be chosen once"),
    accounts: z
      .array(z.object({ platform: z.enum(CREATE_PLATFORMS), socialAccountId: objectIdField }))
      .max(CREATE_PLATFORMS.length)
      .default([]),
    postsPerWeek: z.coerce.number().int().min(1).max(LIMITS.postsPerWeek),
    postingDays: z
      .array(z.enum(AUTOPILOT_WEEKDAYS))
      .min(1, "Choose at least one posting day")
      .refine(unique, "Each day can only be chosen once"),
    postingTimes: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour times like 09:30"))
      .min(1, "Add at least one posting time")
      .max(LIMITS.postingTimes)
      .refine(unique, "Each time can only be added once"),
    pillars: z
      .array(z.string().trim().min(1).max(LIMITS.pillar))
      .max(LIMITS.pillars)
      .refine(unique, "Each pillar can only be added once")
      .default([]),
    formats: z
      .array(z.enum(AUTOPILOT_FORMAT_VALUES))
      .min(1, "Choose at least one content format")
      .refine(unique, "Each format can only be chosen once"),
    approvalRequired: z.boolean(),
    maxPostsPerDay: z.coerce.number().int().min(1).max(LIMITS.postsPerDay),
  })
  .superRefine((value, ctx) => {
    const slots = value.postingDays.length * value.postingTimes.length;
    if (value.postsPerWeek > slots) {
      ctx.addIssue({
        code: "custom",
        path: ["postsPerWeek"],
        message: `${value.postingDays.length} days and ${value.postingTimes.length} times give ${slots} posting slots a week. Lower posts per week or add days or times.`,
      });
    }
    if (value.maxPostsPerDay < value.platforms.length) {
      ctx.addIssue({
        code: "custom",
        path: ["maxPostsPerDay"],
        message:
          "Each post goes to every chosen platform, so the daily limit must be at least the number of platforms.",
      });
    }
  });
export type UpdateAutopilotSettingsInput = z.infer<typeof updateAutopilotSettingsSchema>;

export const pauseAutopilotSchema = z.object({
  reason: z.string().trim().max(LIMITS.pauseReason).optional(),
});
export type PauseAutopilotInput = z.infer<typeof pauseAutopilotSchema>;

export const autopilotPostParamsSchema = z.object({ postId: objectIdField });
export const autopilotSlotParamsSchema = z.object({ slotId: objectIdField });

export const approveAutopilotPostSchema = z.object({
  /** Needed when the planned time has passed. */
  scheduledAt: z.coerce.date().optional(),
});
export type ApproveAutopilotPostInput = z.infer<typeof approveAutopilotPostSchema>;

export const rejectAutopilotPostSchema = z.object({
  reason: z.string().trim().max(LIMITS.rejectReason).optional(),
});
export type RejectAutopilotPostInput = z.infer<typeof rejectAutopilotPostSchema>;

export const listAutopilotEventsQuerySchema = z.object({
  type: z.enum(AUTOPILOT_EVENT_TYPES).optional(),
  post: objectIdField.optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAutopilotEventsQuery = z.infer<typeof listAutopilotEventsQuerySchema>;
