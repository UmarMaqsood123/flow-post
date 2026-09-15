import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

function useRevokeInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      workspaceApi.revokeInvitation({ workspaceId, invitationId }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(workspaceId) }),
  });
}

export default useRevokeInvitation;
