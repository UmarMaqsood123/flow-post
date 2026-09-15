import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { upsertWorkspace } from "./workspaceCache";
import { workspaceApi } from "./workspaceApi";

function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.acceptInvitation,
    onSuccess: async (summary) => {
      upsertWorkspace(queryClient, summary, { makeActive: true });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() });
    },
  });
}

export default useAcceptInvitation;
