import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

function useArchiveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.archive,
    onSuccess: async (_data, workspaceId) => {
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.detail(workspaceId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() });
    },
  });
}

export default useArchiveWorkspace;
