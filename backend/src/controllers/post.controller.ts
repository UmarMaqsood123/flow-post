import type { Request, Response } from "express";
import * as PostService from "../services/post.service";
import { sendCreated, sendPaginated, sendSuccess } from "../utils/apiResponse.util";
import { getWorkspaceContext } from "../utils/workspaceContext.util";
import type {
  GeneratePostsInput,
  ListPostsQuery,
  PostParams,
  PostVersionParams,
  RefinePostInput,
  RegeneratePostInput,
  UpdatePostContentInput,
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

export const DeletePost = async (req: Request, res: Response) => {
  const { postId } = req.params as PostParams;
  await PostService.deletePost(getWorkspaceContext(req), postId);
  sendSuccess(res, { message: "Post deleted", data: null });
};
