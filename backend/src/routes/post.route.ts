import { Router } from "express";
import * as PostController from "../controllers/post.controller";
import { WorkspaceRole } from "../constants/workspace.constant";
import { aiRateLimiters } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { requireWorkspaceRole } from "../middlewares/workspace.middleware";
import {
  calendarQuerySchema,
  createPostSchema,
  generatePostsSchema,
  listPostsQuerySchema,
  postParamsSchema as params,
  postVersionParamsSchema,
  refinePostSchema,
  regeneratePostSchema,
  schedulePostSchema,
  updatePostContentSchema,
  updatePostDetailsSchema,
  updatePostStatusSchema,
} from "../validators/post.validator";

/**
 * /api/v1/workspaces/:workspaceId/posts — mounted on the workspace-scoped router.
 * Members read; editors and above create and change posts.
 */
const PostRouter = Router({ mergeParams: true });

const editor = requireWorkspaceRole(WorkspaceRole.EDITOR);
const aiWrite = [editor, aiRateLimiters.generateByUser, aiRateLimiters.generateByWorkspace];

PostRouter.get("/", validate({ query: listPostsQuerySchema }), PostController.ListPosts);
PostRouter.post("/", editor, validate({ body: createPostSchema }), PostController.CreatePost);
// Before /:postId so "calendar" isn't read as an id.
PostRouter.get("/calendar", validate({ query: calendarQuerySchema }), PostController.GetCalendar);
PostRouter.post(
  "/generate",
  ...aiWrite,
  validate({ body: generatePostsSchema }),
  PostController.GeneratePosts,
);
PostRouter.get("/:postId", validate({ params }), PostController.GetPost);
PostRouter.get("/:postId/schedule", validate({ params }), PostController.GetPostSchedule);
PostRouter.patch(
  "/:postId",
  editor,
  validate({ params, body: updatePostContentSchema }),
  PostController.UpdatePostContent,
);
PostRouter.delete("/:postId", editor, validate({ params }), PostController.DeletePost);
PostRouter.post(
  "/:postId/regenerate",
  ...aiWrite,
  validate({ params, body: regeneratePostSchema }),
  PostController.RegeneratePost,
);
PostRouter.post(
  "/:postId/refine",
  ...aiWrite,
  validate({ params, body: refinePostSchema }),
  PostController.RefinePost,
);
PostRouter.post("/:postId/duplicate", editor, validate({ params }), PostController.DuplicatePost);
PostRouter.patch(
  "/:postId/schedule",
  editor,
  validate({ params, body: schedulePostSchema }),
  PostController.SchedulePost,
);
PostRouter.patch(
  "/:postId/details",
  editor,
  validate({ params, body: updatePostDetailsSchema }),
  PostController.UpdatePostDetails,
);
PostRouter.patch(
  "/:postId/status",
  editor,
  validate({ params, body: updatePostStatusSchema }),
  PostController.UpdatePostStatus,
);
PostRouter.post(
  "/:postId/versions/:versionId/restore",
  editor,
  validate({ params: postVersionParamsSchema }),
  PostController.RestorePostVersion,
);

export { PostRouter };
