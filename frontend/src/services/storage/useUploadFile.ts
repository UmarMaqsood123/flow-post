import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { fileApi } from "./fileApi";

/**
 * Uploads one file to the workspace (like jobs-viewer's `useUploadSingle`):
 * `upload(file)` resolves with the stored file, and `progress` tracks 0–100.
 */
function useUploadFile(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => {
      if (!workspaceId) throw new Error("Select a workspace before uploading.");
      setProgress(0);
      return fileApi.upload({ workspaceId, file, onProgress: setProgress });
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

export default useUploadFile;
