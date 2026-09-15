import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

/** Removes a member, or leaves the workspace when `isSelf` is true. */
function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId }: { memberId: string; isSelf: boolean }) =>
      workspaceApi.removeMember({ workspaceId, memberId }),
    onSuccess: async (_data, { isSelf }) => {
      if (isSelf) {
        queryClient.removeQueries({ queryKey: queryKeys.workspaces.detail(workspaceId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list() });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(workspaceId) });
    },
  });
}

export default useRemoveMember;
