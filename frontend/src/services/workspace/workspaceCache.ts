import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { WorkspaceList, WorkspaceSummary } from "@/types/workspace";

/** Inserts or replaces a workspace in the cached list, optionally making it active. */
export const upsertWorkspace = (
  queryClient: QueryClient,
  summary: WorkspaceSummary,
  { makeActive = false }: { makeActive?: boolean } = {},
) => {
  queryClient.setQueryData<WorkspaceList>(queryKeys.workspaces.list(), (current) => {
    if (!current) return current;
    const exists = current.workspaces.some((item) => item.workspace.id === summary.workspace.id);
    return {
      workspaces: exists
        ? current.workspaces.map((item) =>
            item.workspace.id === summary.workspace.id ? summary : item,
          )
        : [...current.workspaces, summary],
      activeWorkspaceId: makeActive ? summary.workspace.id : current.activeWorkspaceId,
    };
  });
};
