import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { WorkspaceRole } from "@/types/workspace";
import { workspaceApi } from "./workspaceApi";

function useChangeMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: WorkspaceRole }) =>
      workspaceApi.changeMemberRole({ workspaceId, memberId, role }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(workspaceId) }),
        // The current user's own role may have changed.
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() }),
      ]);
    },
  });
}

export default useChangeMemberRole;
