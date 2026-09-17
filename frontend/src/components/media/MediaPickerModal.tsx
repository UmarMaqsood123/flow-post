import { Check, FileText, Play, Upload } from "lucide-react";
import { useState } from "react";
import Modal from "@/components/modals";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { attachBlocker, PLATFORM_MEDIA_RULES } from "@/config/media";
import { platformLabel } from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import useWorkspaceFiles from "@/services/storage/useWorkspaceFiles";
import type { UploadedFile } from "@/types/file";
import type { CreatePlatform, PostAttachment } from "@/types/post";
import UploadMediaModal from "./UploadMediaModal";

interface MediaPickerModalProps {
  open: boolean;
  workspaceId: string;
  platform: CreatePlatform;
  /** What's attached now; the picker starts from this selection. */
  attached: PostAttachment[];
  isSaving: boolean;
  error: unknown;
  onClose: () => void;
  /** The full new selection, in order. */
  onConfirm: (files: UploadedFile[]) => void;
  canUpload: boolean;
}

function Thumbnail({ file }: { file: Pick<UploadedFile, "kind" | "url"> }) {
  if (file.kind === "image") {
    return (
      <img
        src={file.url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
    );
  }
  if (file.kind === "video") {
    return (
      <span className="relative block size-full bg-slate-900">
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
          <Play className="size-6 text-white drop-shadow" aria-hidden="true" />
        </span>
      </span>
    );
  }
  return (
    <span className="flex size-full items-center justify-center text-primary">
      <FileText className="size-8" aria-hidden="true" />
    </span>
  );
}

/**
 * Choose media for a post from the workspace library. Files the platform can't
 * publish stay visible but can't be picked, with the reason, so nobody wonders
 * where their PNG went on Instagram.
 */
function MediaPickerModal({
  open,
  workspaceId,
  platform,
  attached,
  isSaving,
  error,
  onClose,
  onConfirm,
  canUpload,
}: MediaPickerModalProps) {
  const files = useWorkspaceFiles(open ? workspaceId : undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => attached.map((item) => item.id));
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const rule = PLATFORM_MEDIA_RULES[platform];
  const library = files.data ?? [];
  const byId = new Map(library.map((file) => [file.id, file]));
  const selected = selectedIds.flatMap((id) => {
    const file = byId.get(id);
    return file ? [file] : [];
  });

  const toggle = (file: UploadedFile) => {
    setSelectedIds((current) =>
      current.includes(file.id)
        ? current.filter((id) => id !== file.id)
        : // Adding keeps the order people picked things in, which is the posting order.
          [...current, file.id],
    );
  };

  const unchanged =
    selectedIds.length === attached.length &&
    selectedIds.every((id, index) => id === attached[index]?.id);

  return (
    <>
      <Modal
        open={open && !isUploadOpen}
        onClose={onClose}
        title={`Media for ${platformLabel(platform)}`}
        description={rule.summary}
        size="lg"
        dismissible={!isSaving}
        footer={
          <>
            {canUpload && (
              <Button
                variant="secondary"
                className="mr-auto"
                onClick={() => setIsUploadOpen(true)}
                disabled={isSaving}
              >
                <Upload className="size-4" aria-hidden="true" />
                Upload new
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(selected)} disabled={unchanged} isLoading={isSaving}>
              {selected.length === 0 ? "Remove media" : `Attach ${selected.length}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {Boolean(error) && <Alert variant="error">{getErrorMessage(error)}</Alert>}
          {files.isError && <Alert variant="error">{getErrorMessage(files.error)}</Alert>}

          {files.isPending ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <li key={item}>
                  <Skeleton className="aspect-square rounded-lg" />
                </li>
              ))}
            </ul>
          ) : library.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
              Your media library is empty.
              {canUpload && " Upload something to attach it."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {library.map((file) => {
                const position = selectedIds.indexOf(file.id);
                const isSelected = position >= 0;
                // Judged against everything else selected, not counting this file.
                const others = selected.filter((item) => item.id !== file.id);
                const blocker = isSelected ? null : attachBlocker(platform, file, others);
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={Boolean(blocker) || isSaving}
                      onClick={() => toggle(file)}
                      title={blocker ?? file.name}
                      className={cn(
                        "group flex w-full flex-col overflow-hidden rounded-lg border text-left transition",
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-line hover:border-slate-300",
                        blocker && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="relative block aspect-square bg-slate-50">
                        <Thumbnail file={file} />
                        {isSelected && (
                          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                            {selectedIds.length > 1 ? position + 1 : <Check className="size-3.5" />}
                          </span>
                        )}
                      </span>
                      <span className="block px-2 py-1.5">
                        <span className="block truncate text-xs font-medium">{file.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {blocker ??
                            (file.kind === "video"
                              ? "Video"
                              : file.kind === "image"
                                ? "Image"
                                : "Document")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedIds.length > 1 && (
            <p className="text-xs text-muted">
              Numbers show the order the images are posted in. Deselect and reselect to change it.
            </p>
          )}
        </div>
      </Modal>

      {canUpload && (
        <UploadMediaModal
          open={isUploadOpen}
          workspaceId={workspaceId}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={() => setIsUploadOpen(false)}
        />
      )}
    </>
  );
}

export default MediaPickerModal;
