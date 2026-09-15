import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fileApi } from "./fileApi";

function useDeleteFile(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => fileApi.remove({ workspaceId, fileId }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.files(workspaceId) }),
  });
}

export default useDeleteFile;
