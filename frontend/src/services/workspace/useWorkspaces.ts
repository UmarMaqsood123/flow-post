import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import useSession from "@/services/auth/useSession";
import { workspaceApi } from "./workspaceApi";

/** The signed-in user's workspaces and their active workspace id. */
function useWorkspaces() {
  const { data: user } = useSession();
  return useQuery({
    queryKey: queryKeys.workspaces.list(),
    queryFn: workspaceApi.list,
    enabled: Boolean(user),
  });
}

export default useWorkspaces;
