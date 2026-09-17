import { Download, FileText, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import PageHeader from "@/components/shared/PageHeader";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import UploadMediaModal from "@/components/media/UploadMediaModal";
import { DeleteModal } from "@/components/modals";
import { formatFileSize } from "@/lib/files";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import useSession from "@/services/auth/useSession";
import useDeleteFile from "@/services/storage/useDeleteFile";
import useWorkspaceFiles from "@/services/storage/useWorkspaceFiles";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { FileKind, UploadedFile } from "@/types/file";
import { notify } from "@/lib/toast";

const FILTERS: { id: FileKind | "all"; label: string }[] = [
  { id: "all", label: "All files" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "document", label: "Documents" },
];

const KIND_PLURALS: Record<FileKind, string> = {
  image: "images",
  video: "videos",
  document: "documents",
};

interface FileCardProps {
  file: UploadedFile;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}

function FileCard({ file, canDelete, isDeleting, onDelete }: FileCardProps) {
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-video bg-slate-50"
        aria-label={`Open ${file.name}`}
      >
        {file.kind === "image" ? (
          <img
            src={file.url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : file.kind === "video" ? (
          <span className="relative block size-full bg-slate-900">
            {/* Loads only metadata; #t=0.1 shows an early frame as the poster. */}
            <video
              src={`${file.url}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              tabIndex={-1}
              aria-hidden="true"
              className="size-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white">
                <Play className="size-5 translate-x-0.5" aria-hidden="true" />
              </span>
            </span>
          </span>
        ) : (
          <span className="flex size-full items-center justify-center text-primary">
            <FileText className="size-10" aria-hidden="true" />
          </span>
        )}
      </a>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          {file.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-ink/80">{file.description}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted" title={file.fileName}>
            {file.name !== file.fileName && `${file.fileName} · `}
            {formatFileSize(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
          </p>
        </div>
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-ink"
          aria-label={`Download ${file.name}`}
        >
          <Download className="size-4" aria-hidden="true" />
        </a>
        {canDelete && (
          <Button
            variant="secondary"
            className="size-8 border-transparent p-0 text-muted hover:text-red-700"
            aria-label={`Delete ${file.name}`}
            isLoading={isDeleting}
            onClick={onDelete}
          >
            {!isDeleting && <Trash2 className="size-4" aria-hidden="true" />}
          </Button>
        )}
      </div>
    </li>
  );
}

function WorkspaceFiles() {
  const { current } = useCurrentWorkspace();
  const { data: user } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const kindParam = searchParams.get("kind");
  const kind: FileKind | undefined =
    kindParam === "image" || kindParam === "video" || kindParam === "document"
      ? kindParam
      : undefined;

  const workspaceId = current?.workspace.id;
  const files = useWorkspaceFiles(workspaceId, kind);
  const deleteFile = useDeleteFile(workspaceId ?? "");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<UploadedFile | null>(null);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current || !workspaceId) return null;

  const canUpload = hasMinimumRole(current.role, "EDITOR");
  const isAdmin = hasMinimumRole(current.role, "ADMIN");

  const handleDelete = (file: UploadedFile) => {
    deleteFile.reset();
    setFileToDelete(file);
  };

  const confirmDelete = () => {
    if (!fileToDelete) return;
    const name = fileToDelete.name;
    deleteFile.mutate(fileToDelete.id, {
      onSuccess: () => {
        setFileToDelete(null);
        notify.success(`"${name}" deleted.`);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Media"
        description={`Images, videos and documents for ${current.workspace.name}.`}
        actions={
          canUpload && (
            <Button onClick={() => setIsUploadOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add media
            </Button>
          )
        }
      />

      {canUpload && (
        <UploadMediaModal
          open={isUploadOpen}
          workspaceId={workspaceId}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={(count) =>
            notify.success(`${count} ${count === 1 ? "file" : "files"} uploaded.`)
          }
        />
      )}

      {!canUpload && (
        <Alert variant="info">Viewers can browse files. Editors and above can upload.</Alert>
      )}

      <div role="tablist" aria-label="File type" className="flex gap-1 border-b border-line">
        {FILTERS.map((filter) => {
          const selected = (kind ?? "all") === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSearchParams(filter.id === "all" ? {} : { kind: filter.id })}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <DeleteModal
        open={fileToDelete !== null}
        itemName={fileToDelete ? `"${fileToDelete.name}"` : "this file"}
        description="Posts that use it will need another file attached before they can publish."
        isDeleting={deleteFile.isPending}
        error={deleteFile.error}
        onConfirm={confirmDelete}
        onClose={() => setFileToDelete(null)}
      />

      {files.isPending && <PageLoader label="Loading files…" />}
      {files.isError && <Alert variant="error">{getErrorMessage(files.error)}</Alert>}
      {files.data && files.data.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          {kind ? `No ${KIND_PLURALS[kind]} yet.` : "No files yet."}
        </p>
      )}
      {files.data && files.data.length > 0 && (
        <ul role="tabpanel" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.data.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              canDelete={isAdmin || file.uploadedBy === user?.id}
              isDeleting={deleteFile.isPending && deleteFile.variables === file.id}
              onDelete={() => handleDelete(file)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default WorkspaceFiles;
