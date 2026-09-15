import { api } from "@/lib/api";
import type { ApiSuccessResponse } from "@/types/api";
import type {
  GeneratedPosts,
  GeneratePostsPayload,
  ListPostsQuery,
  Post,
  PostStatus,
  PostWithVersions,
  RefinePostPayload,
  RegeneratePostPayload,
  UpdatePostContentPayload,
} from "@/types/post";

const postsPath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/posts`;
const postPath = (workspaceId: string, postId: string) =>
  `${postsPath(workspaceId)}/${encodeURIComponent(postId)}`;

/** Writing for several platforms takes longer than a normal request. */
const GENERATION_TIMEOUT_MS = 3 * 60_000;

type PostResponse = { post: Post };

export const postsApi = {
  list: async (workspaceId: string, query: ListPostsQuery = {}) => {
    const params = new URLSearchParams();
    if (query.platform) params.set("platform", query.platform);
    if (query.status) params.set("status", query.status);
    if (query.page) params.set("page", String(query.page));
    if (query.limit) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return (await api.get<Post[]>(`${postsPath(workspaceId)}${suffix}`)) as ApiSuccessResponse<
      Post[]
    >;
  },

  get: async (workspaceId: string, postId: string) =>
    (await api.get<PostWithVersions>(postPath(workspaceId, postId))).data,

  generate: async (workspaceId: string, payload: GeneratePostsPayload) =>
    (
      await api.post<GeneratedPosts, GeneratePostsPayload>(
        `${postsPath(workspaceId)}/generate`,
        payload,
        { timeout: GENERATION_TIMEOUT_MS },
      )
    ).data,

  regenerate: async (workspaceId: string, postId: string, payload: RegeneratePostPayload) =>
    (
      await api.post<{ post: Post; warnings: string[] }, RegeneratePostPayload>(
        `${postPath(workspaceId, postId)}/regenerate`,
        payload,
        { timeout: GENERATION_TIMEOUT_MS },
      )
    ).data,

  refine: async (workspaceId: string, postId: string, payload: RefinePostPayload) =>
    (
      await api.post<{ post: Post; warnings: string[] }, RefinePostPayload>(
        `${postPath(workspaceId, postId)}/refine`,
        payload,
        { timeout: GENERATION_TIMEOUT_MS },
      )
    ).data,

  update: async (workspaceId: string, postId: string, payload: UpdatePostContentPayload) =>
    (
      await api.patch<PostResponse, UpdatePostContentPayload>(
        postPath(workspaceId, postId),
        payload,
      )
    ).data.post,

  restoreVersion: async (workspaceId: string, postId: string, versionId: string) =>
    (
      await api.post<PostResponse>(
        `${postPath(workspaceId, postId)}/versions/${encodeURIComponent(versionId)}/restore`,
      )
    ).data.post,

  setStatus: async (workspaceId: string, postId: string, status: PostStatus) =>
    (
      await api.patch<PostResponse, { status: PostStatus }>(
        `${postPath(workspaceId, postId)}/status`,
        { status },
      )
    ).data.post,

  remove: async (workspaceId: string, postId: string) => {
    await api.delete<null>(postPath(workspaceId, postId));
  },
};
