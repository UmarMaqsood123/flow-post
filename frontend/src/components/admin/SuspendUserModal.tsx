import { useState } from "react";
import { ConfirmModal } from "@/components/modals";
import TextAreaField from "@/components/ui/TextAreaField";
import { useSuspendUser } from "@/services/admin/useAdmin";
import type { AdminUser } from "@/types/admin";
import { notify } from "@/lib/toast";

interface SuspendUserModalProps {
  user: AdminUser;
  open: boolean;
  onClose: () => void;
}

/** Suspend or reactivate, with a required reason that goes into the audit log. */
function SuspendUserModal({ user, open, onClose }: SuspendUserModalProps) {
  const action = user.status === "suspended" ? "reactivate" : "suspend";
  const mutation = useSuspendUser(user.id);
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 5;

  const close = () => {
    if (mutation.isPending) return;
    mutation.reset();
    setReason("");
    onClose();
  };

  return (
    <ConfirmModal
      open={open}
      tone={action === "suspend" ? "danger" : "primary"}
      title={action === "suspend" ? `Suspend ${user.name}?` : `Reactivate ${user.name}?`}
      message={
        <div className="flex flex-col gap-3">
          <p>
            {action === "suspend"
              ? "They're signed out everywhere right away and can't sign back in. Autopilot stops acting as them. Their workspaces, posts and schedules are left alone."
              : "They'll be able to sign in again. Sessions ended by the suspension stay ended."}
          </p>
          <TextAreaField
            label="Reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint="Required. Saved in the audit log with your name."
          />
        </div>
      }
      confirmLabel={action === "suspend" ? "Suspend user" : "Reactivate user"}
      isLoading={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        if (tooShort) return;
        mutation.mutate(
          { action, reason: reason.trim() },
          {
            onSuccess: () => {
              notify.success(
                action === "suspend"
                  ? `${user.name} was suspended.`
                  : `${user.name} was reactivated.`,
              );
              close();
            },
          },
        );
      }}
      onClose={close}
    />
  );
}

export default SuspendUserModal;
