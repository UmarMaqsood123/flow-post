import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { FileKind } from "@/types/file";
import { fileApi } from "./fileApi";

function useWorkspaceFiles(workspaceId: string | undefined, kind?: FileKind) {
  return useQuery({
    queryKey: [...queryKeys.workspaces.files(workspaceId ?? ""), kind ?? "all"],
    queryFn: () => fileApi.list(workspaceId ?? "", kind),
    enabled: Boolean(workspaceId),
  });
}

export default useWorkspaceFiles;
