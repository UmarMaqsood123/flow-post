import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { brandProfileApi } from "./brandProfileApi";

function useBrandProfile(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.brandProfile(workspaceId ?? ""),
    queryFn: () => brandProfileApi.get(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
}

export default useBrandProfile;
