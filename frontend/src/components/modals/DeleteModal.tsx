import type { ReactNode } from "react";
import ConfirmModal from "./ConfirmModal";

export interface DeleteModalProps {
  open: boolean;
  /** What's being deleted, e.g. "this LinkedIn post" or `"Brand brief"`. */
  itemName: string;
  /** Extra detail about what goes with it. "This can't be undone." is always added. */
  description?: ReactNode;
  /** Defaults to "Delete". */
  confirmLabel?: string;
  isDeleting?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}

/** The standard "are you sure?" for anything permanent. */
function DeleteModal({
  open,
  itemName,
  description,
  confirmLabel = "Delete",
  isDeleting = false,
  error,
  onConfirm,
  onClose,
}: DeleteModalProps) {
  return (
    <ConfirmModal
      open={open}
      tone="danger"
      title={`Delete ${itemName}?`}
      message={
        <div className="flex flex-col gap-2">
          {description && <p>{description}</p>}
          <p className="font-medium text-ink">This can't be undone.</p>
        </div>
      }
      confirmLabel={confirmLabel}
      isLoading={isDeleting}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

export default DeleteModal;
