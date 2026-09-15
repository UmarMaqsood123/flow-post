import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

function useRestoreWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.restore,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() }),
  });
}

export default useRestoreWorkspace;
