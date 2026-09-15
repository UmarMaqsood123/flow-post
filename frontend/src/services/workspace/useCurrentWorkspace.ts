import useWorkspaces from "./useWorkspaces";

/** Resolves the active workspace (and role) from the workspace list. */
function useCurrentWorkspace() {
  const query = useWorkspaces();
  const workspaces = query.data?.workspaces ?? [];
  const activeWorkspaces = workspaces.filter((item) => item.workspace.status === "active");
  const archivedWorkspaces = workspaces.filter((item) => item.workspace.status === "archived");
  const current =
    activeWorkspaces.find((item) => item.workspace.id === query.data?.activeWorkspaceId) ?? null;

  return {
    current,
    activeWorkspaces,
    archivedWorkspaces,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

export default useCurrentWorkspace;
