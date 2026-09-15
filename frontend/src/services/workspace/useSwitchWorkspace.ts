import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertWorkspace } from "./workspaceCache";
import { workspaceApi } from "./workspaceApi";

/**
 * Switching only changes which workspace the UI shows. Every workspace request
 * is still authorized by the API, so a stale or tampered id is harmless.
 */
function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.switch,
    onSuccess: (summary) => upsertWorkspace(queryClient, summary, { makeActive: true }),
  });
}

export default useSwitchWorkspace;
