import { useState } from "react";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { getErrorMessage } from "@/lib/forms";
import useDeleteWorkspace from "@/services/workspace/useDeleteWorkspace";
import useRestoreWorkspace from "@/services/workspace/useRestoreWorkspace";
import type { Workspace } from "@/types/workspace";
import WorkspaceAvatar from "./WorkspaceAvatar";

/** An archived workspace with restore and name-confirmed permanent delete. */
function ArchivedWorkspaceRow({ workspace }: { workspace: Workspace }) {
  const restoreWorkspace = useRestoreWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const [confirming, setConfirming] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const nameMatches = confirmName === workspace.name;
  const error = restoreWorkspace.error ?? deleteWorkspace.error;

  return (
    <li className="py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <WorkspaceAvatar name={workspace.name} logo={workspace.logo} />
          <div className="min-w-0">
            <p className="truncate font-medium">{workspace.name}</p>
            {workspace.archivedAt && (
              <p className="text-sm text-muted">
                Archived {new Date(workspace.archivedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => restoreWorkspace.mutate(workspace.id)}
            isLoading={restoreWorkspace.isPending}
          >
            Restore
          </Button>
          {!confirming && (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete permanently
            </Button>
          )}
        </div>
      </div>

      {confirming && (
        <form
          className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameMatches) deleteWorkspace.mutate({ workspaceId: workspace.id, confirmName });
          }}
        >
          <p className="text-sm text-red-800">
            This permanently deletes <span className="font-semibold">{workspace.name}</span>, its
            members and invitations. This can&apos;t be undone.
          </p>
          <TextField
            label={`Type "${workspace.name}" to confirm`}
            value={confirmName}
            autoComplete="off"
            onChange={(event) => setConfirmName(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={!nameMatches}
              isLoading={deleteWorkspace.isPending}
            >
              Delete forever
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setConfirmName("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {getErrorMessage(error)}
        </p>
      )}
    </li>
  );
}

export default ArchivedWorkspaceRow;
