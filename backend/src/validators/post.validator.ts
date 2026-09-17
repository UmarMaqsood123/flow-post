import { z } from "zod";
import { BRAND_GOALS, BRAND_TONES } from "../constants/brandProfile.constant";
import {
  CREATE_PLATFORMS,
  MANUAL_POST_STATUSES,
  POST_LIMITS as LIMITS,
  POST_STATUSES,
  REFINE_ACTIONS,
} from "../constants/post.constant";
import { normalizeHashtags } from "../integrations/ai/postprocess";
import { VIDEO_FORMATS, MAX_ATTACHMENTS } from "../constants/media.constant";
import { objectIdField } from "./common.validator";
import { formatNumber, list, type Mode, nullableText, text } from "./structuredFields";

const platform = z.enum(CREATE_PLATFORMS, { error: "Choose a supported platform" });
const tone = z.enum(BRAND_TONES, { error: "Choose a supported tone" });

/**
 * One definition of a post's content, used for AI output and for manual edits.
 * Fields a platform doesn't use are cleared (see preparePostContent).
 */
const postContentShape = (mode: Mode) => ({
  /** YouTube Shorts title. */
  title: nullableText(mode, "Title", LIMITS.title),
  hook: nullableText(mode, "Hook", LIMITS.hook),
  /** LinkedIn body between the hook and the call to action. */
  body: nullableText(mode, "Body", LIMITS.body),
  /** What gets published: the post, caption or description. */
  text: text(mode, "Text", LIMITS.text, true),
  cta: nullableText(mode, "Call to action", LIMITS.cta),
  hashtags: list(
    mode,
    "hashtags",
    text(mode, "Hashtag", LIMITS.hashtag),
    LIMITS.hashtags,
  ).transform((tags) => normalizeHashtags(tags, LIMITS.hashtags)),
});

export const postContentSchema = z.object(postContentShape("input"));
export type PostContent = z.output<typeof postContentSchema>;

/** Structured output for one refined post. Validated with postContentSchema before storing. */
export const postContentOutputSchema = z.object(
  postContentShape("ai"),
) as unknown as z.ZodType<PostContent>;

export interface PostDraft extends PostContent {
  platform: (typeof CREATE_PLATFORMS)[number];
}

/** Structured output for a generation: one draft per requested platform. */
export const postDraftsOutputSchema = z.object({
  drafts: z.array(z.object({ platform, ...postContentShape("ai") })),
}) as unknown as z.ZodType<{ drafts: PostDraft[] }>;

// ── Requests ───────────────────────────────────────────────

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${formatNumber(max)} characters`);

/** Blank strings become undefined. */
const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${formatNumber(max)} characters`)
    .optional()
    .transform((value) => value || undefined);

export const generatePostsSchema = z.object({
  topic: requiredText("Topic", LIMITS.topic),
  goal: z.enum(BRAND_GOALS, { error: "Choose a goal" }).optional(),
  platforms: z
    .array(platform, { error: "Choose at least one platform" })
    .min(1, "Choose at least one platform")
    .max(CREATE_PLATFORMS.length)
    .transform((values) => [...new Set(values)]),
  tone: tone.optional(),
  instructions: optionalText("Instructions", LIMITS.instructions),
});

/** Overrides for this regeneration; omitted values reuse the post's brief. */
export const regeneratePostSchema = z.object({
  tone: tone.optional(),
  instructions: optionalText("Instructions", LIMITS.instructions),
});

export const refinePostSchema = z
  .object({
    action: z.enum(REFINE_ACTIONS, { error: "Choose an action" }),
    tone: tone.optional(),
    instructions: optionalText("Instructions", LIMITS.instructions),
  })
  .refine((value) => value.action !== "CHANGE_TONE" || value.tone !== undefined, {
    message: "Choose the tone to change to",
    path: ["tone"],
  });

export const updatePostContentSchema = z.object({
  /** The version the editor loaded; the save fails if someone changed it since. */
  baseVersion: z.number({ error: "Reload the post and try again" }).int().min(1),
  content: postContentSchema,
  /**
   * Media library file ids in posting order. Left out, the current media is
   * kept; an empty array removes it all.
   */
  media: z
    .array(objectIdField)
    .max(MAX_ATTACHMENTS, `Attach up to ${MAX_ATTACHMENTS} files`)
    .optional(),
  videoFormat: z.enum(VIDEO_FORMATS, { error: "Choose a video format" }).nullable().optional(),
});

/** Only the statuses a person sets; scheduling and publishing move the rest. */
export const updatePostStatusSchema = z.object({
  status: z.enum(MANUAL_POST_STATUSES, { error: "Choose a valid status" }),
});

/**
 * Times always arrive as an absolute instant (ISO 8601 with an offset or Z) and
 * are stored in UTC. The workspace time zone belongs to how they're displayed.
 */
const instant = z.iso
  .datetime({ offset: true, error: "Use an ISO date and time with a time zone offset" })
  .transform((value) => new Date(value));

export const createPostSchema = z.object({
  platform,
  topic: requiredText("Topic", LIMITS.topic),
  pillar: optionalText("Pillar", LIMITS.pillar),
  status: z.enum(MANUAL_POST_STATUSES, { error: "Choose a valid status" }).default("IDEA"),
  scheduledAt: instant.optional(),
  goal: z.enum(BRAND_GOALS, { error: "Choose a goal" }).optional(),
  tone: tone.optional(),
  instructions: optionalText("Instructions", LIMITS.instructions),
  /** Optional: a post created without content starts from its topic. */
  content: postContentSchema.optional(),
});

/** Schedule, reschedule (same call with a new time) or unschedule with null. */
export const schedulePostSchema = z.object({
  scheduledAt: z.union([instant, z.null()]),
  /** Which connected account publishes it; only needed when the workspace has several. */
  socialAccountId: objectIdField.optional(),
  /**
   * True when the user pressed Schedule, meaning "publish this at that time".
   * An idea or draft is moved on for them. False (dragging a card, say) only
   * moves the post on the calendar and leaves its status alone.
   */
  publish: z.boolean().default(false),
});

const clearableText = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${formatNumber(max)} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const updatePostDetailsSchema = z
  .object({
    topic: requiredText("Topic", LIMITS.topic).optional(),
    pillar: clearableText("Pillar", LIMITS.pillar),
    goal: z.enum(BRAND_GOALS, { error: "Choose a goal" }).nullable().optional(),
    tone: tone.nullable().optional(),
    instructions: clearableText("Instructions", LIMITS.instructions),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Nothing to update",
  });

/** "LINKEDIN,TIKTOK" → ["LINKEDIN", "TIKTOK"]. */
const splitList = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0
    ? [
        ...new Set(
          value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        ),
      ]
    : undefined;

const enumList = <T extends string>(values: readonly [T, ...T[]], label: string) =>
  z.preprocess(
    splitList,
    z
      .array(z.enum(values), { error: `Unknown ${label}` })
      .max(values.length)
      .optional(),
  );

const pillarList = z.preprocess(
  splitList,
  z.array(z.string().trim().max(LIMITS.pillar)).max(20).optional(),
);

export const listPostsQuerySchema = z.object({
  // Comma lists, so the Content screen can filter several at once. A single
  // value still works for existing callers.
  platform: enumList(CREATE_PLATFORMS, "platform"),
  status: enumList(POST_STATUSES, "status"),
  pillar: pillarList,
  /** Matches the topic or the post's text, case-insensitively. */
  q: z.string().trim().max(100).optional(),
  /** "true" only posts with media attached, "false" only posts without. */
  hasMedia: z.enum(["true", "false"]).optional(),
  /** "true" only scheduled posts, "false" only unscheduled ones. */
  scheduled: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.listLimit).default(20),
});

export const calendarQuerySchema = z
  .object({
    from: instant,
    to: instant,
    platform: enumList(CREATE_PLATFORMS, "platform"),
    status: enumList(POST_STATUSES, "status"),
    pillar: pillarList,
    /** The backlog shown beside the calendar. */
    includeUnscheduled: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .refine(({ from, to }) => to.getTime() > from.getTime(), {
    message: "The end of the range must be after the start",
    path: ["to"],
  })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= LIMITS.calendarDays * 86_400_000, {
    message: `Ask for at most ${LIMITS.calendarDays} days`,
    path: ["to"],
  });

export const postParamsSchema = z.object({ postId: objectIdField });
export const postVersionParamsSchema = z.object({
  postId: objectIdField,
  versionId: objectIdField,
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export type UpdatePostDetailsInput = z.infer<typeof updatePostDetailsSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type GeneratePostsInput = z.infer<typeof generatePostsSchema>;
export type RegeneratePostInput = z.infer<typeof regeneratePostSchema>;
export type RefinePostInput = z.infer<typeof refinePostSchema>;
export type UpdatePostContentInput = z.infer<typeof updatePostContentSchema>;
export type UpdatePostStatusInput = z.infer<typeof updatePostStatusSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type PostParams = z.infer<typeof postParamsSchema>;
export type PostVersionParams = z.infer<typeof postVersionParamsSchema>;
