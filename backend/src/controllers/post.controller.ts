import type { Request, Response } from "express";
import { PostStatus } from "../constants/post.constant";
import * as PostService from "../services/post.service";
import * as PublishingService from "../services/publishing.service";
import { sendCreated, sendPaginated, sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  CalendarQuery,
  CreatePostInput,
  GeneratePostsInput,
  ListPostsQuery,
  PostParams,
  PostVersionParams,
  RefinePostInput,
  RegeneratePostInput,
  SchedulePostInput,
  UpdatePostContentInput,
  UpdatePostDetailsInput,
  UpdatePostStatusInput,
} from "../validators/post.validator";

export const GeneratePosts = async (req: Request, res: Response) => {
  const result = await PostService.generatePosts(
    getWorkspaceContext(req),
    req.body as GeneratePostsInput,
  );
  sendCreated(res, result, "Posts generated");
};

export const ListPosts = async (req: Request, res: Response) => {
  const query = req.query as unknown as ListPostsQuery;
  const { items, total } = await PostService.listPosts(getWorkspaceContext(req), query);
  sendPaginated(res, { items, total, page: query.page, limit: query.limit, message: "Posts" });
};

export const GetPost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const data = await PostService.getPost(getWorkspaceContext(req), postId);
  sendSuccess(res, { message: "Post", data });
};

export const RegeneratePost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const data = await PostService.regeneratePost(
    getWorkspaceContext(req),
    postId,
    req.body as RegeneratePostInput,
  );
  sendCreated(res, data, "New version generated");
};

export const RefinePost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const data = await PostService.refinePost(
    getWorkspaceContext(req),
    postId,
    req.body as RefinePostInput,
  );
  sendCreated(res, data, "Post updated");
};

export const UpdatePostContent = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await PostService.updatePostContent(
    getWorkspaceContext(req),
    postId,
    req.body as UpdatePostContentInput,
  );
  sendSuccess(res, { message: "Post saved", data: { post } });
};

export const RestorePostVersion = async (req: Request, res: Response) => {
  const { postId, versionId } = req.params as PostVersionParams;
  const post = await PostService.restoreVersion(getWorkspaceContext(req), postId, versionId);
  sendSuccess(res, { message: "Version restored", data: { post } });
};

export const UpdatePostStatus = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await PostService.updatePostStatus(
    getWorkspaceContext(req),
    postId,
    req.body as UpdatePostStatusInput,
  );
  sendSuccess(res, { message: "Status updated", data: { post } });
};

export const CreatePost = async (req: Request, res: Response) => {
  const post = await PostService.createPost(getWorkspaceContext(req), req.body as CreatePostInput);
  sendCreated(res, { post }, "Post created");
};

export const DuplicatePost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await PostService.duplicatePost(getWorkspaceContext(req), postId);
  sendCreated(res, { post }, "Post duplicated");
};

export const SchedulePost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await PostService.schedulePost(
    getWorkspaceContext(req),
    postId,
    req.body as SchedulePostInput,
  );
  // A date alone doesn't queue anything, so say which of the two happened.
  const message = !post.scheduledAt
    ? "Post unscheduled"
    : post.status === PostStatus.SCHEDULED
      ? "Post scheduled"
      : "Moved on the calendar. It won't publish until you schedule it.";
  sendSuccess(res, { message, data: { post } });
};

export const UpdatePostDetails = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const post = await PostService.updatePostDetails(
    getWorkspaceContext(req),
    postId,
    req.body as UpdatePostDetailsInput,
  );
  sendSuccess(res, { message: "Post updated", data: { post } });
};

/** The publishing schedule for a post, with its job and attempt history. */
export const GetPostSchedule = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  const data = await PublishingService.getScheduleForPost(getWorkspaceContext(req), postId);
  sendSuccess(res, { message: "Schedule", data });
};

export const GetCalendar = async (req: Request, res: Response) => {
  const data = await PostService.getCalendar(
    getWorkspaceContext(req),
    req.query as unknown as CalendarQuery,
  );
  sendSuccess(res, { message: "Calendar", data });
};

export const DeletePost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  await PostService.deletePost(getWorkspaceContext(req), postId);
  sendSuccess(res, { message: "Post deleted", data: null });
};
