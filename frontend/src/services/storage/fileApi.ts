import type { AxiosProgressEvent } from "axios";
import { api } from "@/lib/api";
import type { FileKind, UploadedFile } from "@/types/file";

const filesPath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/files`;

type ProgressHandler = (percent: number) => void;

const progressListener = (onProgress?: ProgressHandler) =>
  onProgress
    ? (event: AxiosProgressEvent) => {
        if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
      }
    : undefined;

/**
 * The shared axios instance defaults to JSON; multipart must be declared so axios
 * sends FormData as-is (the browser then adds the boundary).
 */
const multipartConfig = (onProgress?: ProgressHandler) => ({
  headers: { "Content-Type": "multipart/form-data" },
  onUploadProgress: progressListener(onProgress),
  // Large videos can take a while to upload on slow connections.
  timeout: 15 * 60_000,
});

export const fileApi = {
  upload: async ({
    workspaceId,
    file,
    onProgress,
  }: {
    workspaceId: string;
    file: File;
    onProgress?: ProgressHandler;
  }) => {
    const body = new FormData();
    body.append("file", file);
    return (
      await api.post<{ file: UploadedFile }, FormData>(
        filesPath(workspaceId),
        body,
        multipartConfig(onProgress),
      )
    ).data.file;
  },

  uploadMany: async ({
    workspaceId,
    files,
    onProgress,
  }: {
    workspaceId: string;
    files: File[];
    onProgress?: ProgressHandler;
  }) => {
    const body = new FormData();
    for (const file of files) body.append("files", file);
    return (
      await api.post<{ files: UploadedFile[] }, FormData>(
        `${filesPath(workspaceId)}/batch`,
        body,
        multipartConfig(onProgress),
      )
    ).data.files;
  },

  list: async (workspaceId: string, kind?: FileKind) =>
    (
      await api.get<{ files: UploadedFile[] }>(filesPath(workspaceId), {
        params: kind ? { kind } : undefined,
      })
    ).data.files,

  remove: async ({ workspaceId, fileId }: { workspaceId: string; fileId: string }) => {
    await api.delete<null>(`${filesPath(workspaceId)}/${encodeURIComponent(fileId)}`);
  },
};
