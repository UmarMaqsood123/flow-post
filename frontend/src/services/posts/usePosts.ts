import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type {
  GeneratePostsPayload,
  ListPostsQuery,
  Post,
  PostStatus,
  RefinePostPayload,
  RegeneratePostPayload,
  UpdatePostContentPayload,
} from "@/types/post";
import { postsApi } from "./postsApi";

export function usePosts(workspaceId: string | undefined, query: ListPostsQuery = {}) {
  return useQuery({
    queryKey: queryKeys.workspaces.postList(workspaceId ?? "", query),
    queryFn: () => postsApi.list(workspaceId ?? "", query),
    enabled: Boolean(workspaceId),
  });
}

/** One post with its full version history. */
export function usePost(workspaceId: string | undefined, postId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.post(workspaceId ?? "", postId ?? ""),
    queryFn: () => postsApi.get(workspaceId ?? "", postId ?? ""),
    enabled: Boolean(workspaceId && postId),
  });
}

function usePostCache(workspaceId: string) {
  const queryClient = useQueryClient();
  const refreshLists = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.postLists(workspaceId) });
  return {
    refreshLists,
    /** Keeps the open post in step with the server, including its new version. */
    store: (post: Post) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.post(workspaceId, post.id),
      });
      void refreshLists();
    },
    forget: (postId: string) => {
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.post(workspaceId, postId) });
      void refreshLists();
    },
  };
}

export function useGeneratePosts(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: (payload: GeneratePostsPayload) => postsApi.generate(workspaceId, payload),
    onSuccess: () => void cache.refreshLists(),
  });
}

export function useRegeneratePost(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: ({ postId, payload }: { postId: string; payload: RegeneratePostPayload }) =>
      postsApi.regenerate(workspaceId, postId, payload),
    onSuccess: ({ post }) => cache.store(post),
  });
}

export function useRefinePost(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: ({ postId, payload }: { postId: string; payload: RefinePostPayload }) =>
      postsApi.refine(workspaceId, postId, payload),
    onSuccess: ({ post }) => cache.store(post),
  });
}

export function useUpdatePost(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: ({ postId, payload }: { postId: string; payload: UpdatePostContentPayload }) =>
      postsApi.update(workspaceId, postId, payload),
    onSuccess: (post) => cache.store(post),
  });
}

export function useRestorePostVersion(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: ({ postId, versionId }: { postId: string; versionId: string }) =>
      postsApi.restoreVersion(workspaceId, postId, versionId),
    onSuccess: (post) => cache.store(post),
  });
}

export function useSetPostStatus(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: ({ postId, status }: { postId: string; status: PostStatus }) =>
      postsApi.setStatus(workspaceId, postId, status),
    onSuccess: (post) => cache.store(post),
  });
}

export function useDeletePost(workspaceId: string) {
  const cache = usePostCache(workspaceId);
  return useMutation({
    mutationFn: (postId: string) => postsApi.remove(workspaceId, postId),
    onSuccess: (_result, postId) => cache.forget(postId),
  });
}
