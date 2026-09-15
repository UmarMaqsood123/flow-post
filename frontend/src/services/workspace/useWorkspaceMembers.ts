import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { workspaceApi } from "./workspaceApi";

function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.members(workspaceId ?? ""),
    queryFn: () => workspaceApi.listMembers(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
}

export default useWorkspaceMembers;
