import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "@/lib/queryKeys";
import type { MediaDetails } from "@/types/file";
import { fileApi } from "./fileApi";

/** Uploads several files in one all-or-nothing request, with combined progress. */
function useUploadFiles(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ files, details }: { files: File[]; details?: MediaDetails[] }) => {
      if (!workspaceId) throw new Error("Select a workspace before uploading.");
      setProgress(0);
      return fileApi.uploadMany({ workspaceId, files, details, onProgress: setProgress });
    },
    onSettled: () => setProgress(null),
    onSuccess: async () => {
      if (workspaceId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.files(workspaceId) });
      }
    },
  });

  return {
    upload: mutation.mutateAsync,
    isUploading: mutation.isPending,
    progress,
    error: mutation.error,
    reset: mutation.reset,
  };
}

export default useUploadFiles;
