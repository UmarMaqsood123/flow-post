import { api } from "@/lib/api";
import type { ApiSuccessResponse } from "@/types/api";
import type {
  CalendarQuery,
  CalendarResponse,
  GeneratedPosts,
  GeneratePostsPayload,
  ListPostsQuery,
  Post,
  PostStatus,
  PostWithVersions,
  RefinePostPayload,
  RegeneratePostPayload,
  ScheduleHistory,
  SchedulePostInput,
  UpdatePostContentPayload,
  UpdatePostDetailsPayload,
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
    if (query.platform?.length) params.set("platform", query.platform.join(","));
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.pillar?.length) params.set("pillar", query.pillar.join(","));
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.hasMedia !== undefined) params.set("hasMedia", String(query.hasMedia));
    if (query.scheduled) params.set("scheduled", query.scheduled);
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

  /** The calendar grid plus the unscheduled backlog. */
  calendar: async (workspaceId: string, query: CalendarQuery) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.platform?.length) params.set("platform", query.platform.join(","));
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.pillar?.length) params.set("pillar", query.pillar.join(","));
    if (query.includeUnscheduled === false) params.set("includeUnscheduled", "false");
    return (
      await api.get<CalendarResponse>(`${postsPath(workspaceId)}/calendar?${params.toString()}`)
    ).data;
  },

  duplicate: async (workspaceId: string, postId: string) =>
    (await api.post<PostResponse>(`${postPath(workspaceId, postId)}/duplicate`)).data.post,

  /** `scheduledAt` is an ISO instant with an offset; null unschedules. */
  schedule: async (workspaceId: string, postId: string, input: SchedulePostInput) =>
    (
      await api.patch<PostResponse, SchedulePostInput>(
        `${postPath(workspaceId, postId)}/schedule`,
        input,
      )
    ).data.post,

  /** The publishing schedule for a post, with its job and attempt history. */
  scheduleHistory: async (workspaceId: string, postId: string) =>
    (await api.get<ScheduleHistory>(`${postPath(workspaceId, postId)}/schedule`)).data,

  updateDetails: async (workspaceId: string, postId: string, payload: UpdatePostDetailsPayload) =>
    (
      await api.patch<PostResponse, UpdatePostDetailsPayload>(
        `${postPath(workspaceId, postId)}/details`,
        payload,
      )
    ).data.post,

  remove: async (workspaceId: string, postId: string) => {
    await api.delete<null>(postPath(workspaceId, postId));
  },
};
