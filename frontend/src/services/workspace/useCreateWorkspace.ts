import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertWorkspace } from "./workspaceCache";
import { workspaceApi } from "./workspaceApi";

/** The API makes a newly created workspace the user's active workspace. */
function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.create,
    onSuccess: (summary) => upsertWorkspace(queryClient, summary, { makeActive: true }),
  });
}

export default useCreateWorkspace;
