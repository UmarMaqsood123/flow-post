import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { InvitableRole } from "@/types/workspace";
import { workspaceApi } from "./workspaceApi";

function useInviteMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: InvitableRole }) =>
      workspaceApi.inviteMember({ workspaceId, email, role }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(workspaceId) }),
  });
}

export default useInviteMember;
