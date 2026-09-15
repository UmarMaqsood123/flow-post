import { z } from "zod";
import { BRAND_GOALS, BRAND_TONES } from "../constants/brandProfile.constant";
import {
  CREATE_PLATFORMS,
  POST_LIMITS as LIMITS,
  POST_STATUSES,
  REFINE_ACTIONS,
} from "../constants/post.constant";
import { normalizeHashtags } from "../integrations/ai/postprocess";
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
  /** Video scripts (TikTok, YouTube Shorts). */
  script: list(
    mode,
    "scenes",
    z.object({
      scene: text(mode, "Scene", LIMITS.scriptLine),
      voiceover: text(mode, "Voiceover", LIMITS.scriptLine),
    }),
    LIMITS.scenes,
    { keep: (item) => item.scene.length > 0 || item.voiceover.length > 0 },
  ),
  /** Carousel outline or reel/video concept. */
  visualIdea: nullableText(mode, "Visual idea", LIMITS.visualIdea),
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
});

export const updatePostStatusSchema = z.object({
  status: z.enum(POST_STATUSES, { error: "Choose a valid status" }),
});

export const listPostsQuerySchema = z.object({
  platform: platform.optional(),
  status: z.enum(POST_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.listLimit).default(20),
});

export const postParamsSchema = z.object({ postId: objectIdField });
export const postVersionParamsSchema = z.object({
  postId: objectIdField,
  versionId: objectIdField,
});

export type GeneratePostsInput = z.infer<typeof generatePostsSchema>;
export type RegeneratePostInput = z.infer<typeof regeneratePostSchema>;
export type RefinePostInput = z.infer<typeof refinePostSchema>;
export type UpdatePostContentInput = z.infer<typeof updatePostContentSchema>;
export type UpdatePostStatusInput = z.infer<typeof updatePostStatusSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
export type PostParams = z.infer<typeof postParamsSchema>;
export type PostVersionParams = z.infer<typeof postVersionParamsSchema>;
