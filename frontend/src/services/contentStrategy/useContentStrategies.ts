import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type {
  ContentStrategy,
  GenerateStrategyPayload,
  RegenerateStrategyPayload,
  UpdateStrategyPayload,
} from "@/types/contentStrategy";
import { contentStrategyApi } from "./contentStrategyApi";

export function useContentStrategies(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.contentStrategyList(workspaceId ?? ""),
    queryFn: () => contentStrategyApi.list(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
}

export function useContentStrategy(
  workspaceId: string | undefined,
  strategyId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.workspaces.contentStrategy(workspaceId ?? "", strategyId ?? ""),
    queryFn: () => contentStrategyApi.get(workspaceId ?? "", strategyId ?? ""),
    enabled: Boolean(workspaceId && strategyId),
  });
}

/** Stores a returned strategy and refreshes the version list. */
function useStrategyCache(workspaceId: string) {
  const queryClient = useQueryClient();
  return {
    store: (strategy: ContentStrategy) => {
      queryClient.setQueryData(
        queryKeys.workspaces.contentStrategy(workspaceId, strategy.id),
        strategy,
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.contentStrategyList(workspaceId),
      });
    },
    /** Activation changes other versions' status too. */
    refreshAll: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.contentStrategies(workspaceId),
      }),
  };
}

export function useGenerateContentStrategy(workspaceId: string) {
  const cache = useStrategyCache(workspaceId);
  return useMutation({
    mutationFn: (payload: GenerateStrategyPayload) =>
      contentStrategyApi.generate(workspaceId, payload),
    onSuccess: ({ strategy }) => cache.store(strategy),
  });
}

export function useRegenerateContentStrategy(workspaceId: string) {
  const cache = useStrategyCache(workspaceId);
  return useMutation({
    mutationFn: ({
      strategyId,
      payload,
    }: {
      strategyId: string;
      payload: RegenerateStrategyPayload;
    }) => contentStrategyApi.regenerate(workspaceId, strategyId, payload),
    onSuccess: ({ strategy }) => cache.store(strategy),
  });
}

export function useUpdateContentStrategy(workspaceId: string) {
  const cache = useStrategyCache(workspaceId);
  return useMutation({
    mutationFn: ({ strategyId, payload }: { strategyId: string; payload: UpdateStrategyPayload }) =>
      contentStrategyApi.update(workspaceId, strategyId, payload),
    onSuccess: (strategy) => cache.store(strategy),
  });
}

export function useActivateContentStrategy(workspaceId: string) {
  const cache = useStrategyCache(workspaceId);
  return useMutation({
    mutationFn: (strategyId: string) => contentStrategyApi.activate(workspaceId, strategyId),
    onSuccess: (strategy) => {
      cache.store(strategy);
      void cache.refreshAll();
    },
  });
}
