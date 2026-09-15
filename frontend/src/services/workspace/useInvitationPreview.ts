import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

function useInvitationPreview(token: string | null) {
  return useQuery({
    queryKey: queryKeys.workspaces.invitationPreview(token ?? ""),
    queryFn: () => workspaceApi.previewInvitation(token ?? ""),
    enabled: Boolean(token),
    retry: false,
  });
}

export default useInvitationPreview;
