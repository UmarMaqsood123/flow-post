import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertWorkspace } from "./workspaceCache";
import { workspaceApi } from "./workspaceApi";

function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.update,
    onSuccess: (summary) => upsertWorkspace(queryClient, summary),
  });
}

export default useUpdateWorkspace;
