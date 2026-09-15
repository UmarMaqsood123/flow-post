import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

/** Pending invitations — only admins and owners can list them. */
function useWorkspaceInvitations(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.workspaces.invitations(workspaceId ?? ""),
    queryFn: () => workspaceApi.listInvitations(workspaceId ?? ""),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export default useWorkspaceInvitations;
