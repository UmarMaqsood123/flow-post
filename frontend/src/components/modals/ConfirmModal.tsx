import type { ReactNode } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { getErrorMessage } from "@/lib/forms";
import Modal from "./Modal";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for anything that removes, revokes or can't be undone. */
  tone?: "primary" | "danger";
  /** True while the action runs; the modal stays open and can't be dismissed. */
  isLoading?: boolean;
  /** Shown inside the modal so a failure doesn't close it silently. */
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Asks before doing something that matters. Replaces `window.confirm` so the
 * question looks like the app, can show the result of a failed attempt, and
 * doesn't block the whole page.
 *
 * The caller closes it on success; on failure it stays open with the error.
 */
function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  isLoading = false,
  error,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!isLoading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            isLoading={isLoading}
            className={
              tone === "danger"
                ? "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/60"
                : undefined
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink/80">
        {typeof message === "string" ? <p className="whitespace-pre-line">{message}</p> : message}
        {Boolean(error) && <Alert variant="error">{getErrorMessage(error)}</Alert>}
      </div>
    </Modal>
  );
}

export default ConfirmModal;
