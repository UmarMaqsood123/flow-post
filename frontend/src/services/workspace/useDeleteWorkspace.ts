import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

/** Permanently deletes an archived workspace. Irreversible. */
function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.deletePermanently,
    onSuccess: async (_data, { workspaceId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.detail(workspaceId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() });
    },
  });
}

export default useDeleteWorkspace;
