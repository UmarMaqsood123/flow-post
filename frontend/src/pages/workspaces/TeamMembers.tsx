import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import PageLoader from "@/components/shared/PageLoader";
import SettingsCard from "@/components/shared/SettingsCard";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import TextField from "@/components/ui/TextField";
import RoleBadge from "@/components/workspace/RoleBadge";
import WorkspaceAvatar from "@/components/workspace/WorkspaceAvatar";
import {
  INVITABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  WORKSPACE_ROLES,
} from "@/config/workspace";
import { ApiError } from "@/lib/apiError";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { canAssignRole, canManageMember, hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import { inviteMemberSchema, type InviteMemberValues } from "@/schemas/workspace.schema";
import useSession from "@/services/auth/useSession";
import useChangeMemberRole from "@/services/workspace/useChangeMemberRole";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useInviteMember from "@/services/workspace/useInviteMember";
import useRemoveMember from "@/services/workspace/useRemoveMember";
import useRevokeInvitation from "@/services/workspace/useRevokeInvitation";
import useWorkspaceInvitations from "@/services/workspace/useWorkspaceInvitations";
import useWorkspaceMembers from "@/services/workspace/useWorkspaceMembers";
import type { WorkspaceMember, WorkspaceRole } from "@/types/workspace";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function InviteMemberForm({
  workspaceId,
  actorRole,
}: {
  workspaceId: string;
  actorRole: WorkspaceRole;
}) {
  const inviteMember = useInviteMember(workspaceId);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const assignableRoles = INVITABLE_ROLES.filter((role) => canAssignRole(actorRole, role));
  const defaultRole: InviteMemberValues["role"] = assignableRoles.includes("EDITOR")
    ? "EDITOR"
    : "VIEWER";
  const roleOptions = assignableRoles.map((role) => ({
    name: ROLE_LABELS[role],
    value: role,
    description: ROLE_DESCRIPTIONS[role],
  }));
  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: defaultRole },
  });

  const onSubmit = handleSubmit(async ({ email, role }) => {
    setFormError(null);
    setSentTo(null);
    try {
      await inviteMember.mutateAsync({ email, role });
      reset({ email: "", role });
      setSentTo(email);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        setError("email", { type: "server", message: error.message });
      } else if (!applyServerFieldErrors(error, setError, ["email", "role"])) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {sentTo && <Alert variant="success">Invitation sent to {sentTo}.</Alert>}

      <div className="grid items-start gap-4 sm:grid-cols-[1fr_10rem_auto]">
        <TextField
          label="Email address"
          type="email"
          autoComplete="off"
          placeholder="teammate@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Controller
          control={control}
          name="role"
          render={({ field, fieldState }) => (
            <Dropdown
              ref={field.ref}
              label="Role"
              options={roleOptions}
              selected={roleOptions.find((option) => option.value === field.value) ?? null}
              onChange={(option) => field.onChange(option.value)}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              disabled={isSubmitting}
              menuClassName="w-72"
            />
          )}
        />
        <Button type="submit" isLoading={isSubmitting} className="sm:mt-6.5">
          Send invite
        </Button>
      </div>
    </form>
  );
}

interface MemberRowProps {
  member: WorkspaceMember;
  actorRole: WorkspaceRole;
  isSelf: boolean;
  workspaceId: string;
  workspaceName: string;
}

function MemberRow({ member, actorRole, isSelf, workspaceId, workspaceName }: MemberRowProps) {
  const changeRole = useChangeMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const navigate = useNavigate();

  const managesTarget =
    hasMinimumRole(actorRole, "ADMIN") && canManageMember(actorRole, member.role);
  const canEditRole = isSelf ? actorRole === "OWNER" : managesTarget;
  const canRemove = isSelf || managesTarget;
  const roleOptions: DropdownOption<WorkspaceRole>[] = WORKSPACE_ROLES.filter(
    (role) => role === member.role || canAssignRole(actorRole, role),
  ).map((role) => ({ name: ROLE_LABELS[role], value: role, description: ROLE_DESCRIPTIONS[role] }));
  const error = changeRole.error ?? removeMember.error;

  const handleRemove = () => {
    const message = isSelf
      ? `Leave "${workspaceName}"? You'll need a new invitation to rejoin.`
      : `Remove ${member.user.name} from "${workspaceName}"?`;
    if (!window.confirm(message)) return;
    removeMember.mutate(
      { memberId: member.id, isSelf },
      { onSuccess: () => isSelf && navigate(paths.dashboard) },
    );
  };

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <WorkspaceAvatar name={member.user.name} size="md" className="rounded-full" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.user.name}
            {isSelf && <span className="ml-1.5 font-normal text-muted">(you)</span>}
          </p>
          <p className="truncate text-sm text-muted">{member.user.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-12 sm:pl-0">
        {canEditRole ? (
          <Dropdown
            ariaLabel={`Role for ${member.user.name}`}
            size="sm"
            className="w-32"
            menuClassName="w-72"
            options={roleOptions}
            selected={roleOptions.find((option) => option.value === member.role) ?? null}
            disabled={changeRole.isPending}
            onChange={(option) => {
              if (option.value !== member.role) {
                changeRole.mutate({ memberId: member.id, role: option.value });
              }
            }}
          />
        ) : (
          <RoleBadge role={member.role} />
        )}

        {canRemove && (
          <Button
            variant="secondary"
            className="px-3 py-1.5"
            onClick={handleRemove}
            isLoading={removeMember.isPending}
          >
            {isSelf ? "Leave" : "Remove"}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 sm:basis-full">
          {getErrorMessage(error)}
        </p>
      )}
    </li>
  );
}

function PendingInvitations({ workspaceId }: { workspaceId: string }) {
  const invitations = useWorkspaceInvitations(workspaceId, true);
  const revokeInvitation = useRevokeInvitation(workspaceId);

  if (invitations.isPending) return <p className="text-sm text-muted">Loading invitations…</p>;
  if (invitations.isError) {
    return <Alert variant="error">{getErrorMessage(invitations.error)}</Alert>;
  }
  if (invitations.data.length === 0) {
    return <p className="text-sm text-muted">No pending invitations.</p>;
  }

  return (
    <>
      {revokeInvitation.isError && (
        <Alert variant="error" className="mb-3">
          {getErrorMessage(revokeInvitation.error)}
        </Alert>
      )}
      <ul className="divide-y divide-line">
        {invitations.data.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{invitation.email}</p>
              <p className="text-xs text-muted">
                Invited{invitation.invitedBy ? ` by ${invitation.invitedBy.name}` : ""} · expires{" "}
                {formatDate(invitation.expiresAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={invitation.role} />
              <Button
                variant="secondary"
                className="px-3 py-1.5"
                isLoading={
                  revokeInvitation.isPending && revokeInvitation.variables === invitation.id
                }
                onClick={() => revokeInvitation.mutate(invitation.id)}
              >
                Revoke
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function TeamMembers() {
  const { current } = useCurrentWorkspace();
  const { data: user } = useSession();
  const members = useWorkspaceMembers(current?.workspace.id);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;
  const { workspace, role } = current;
  const canManageTeam = hasMinimumRole(role, "ADMIN");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-muted">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Team members</h1>
        {members.data && (
          <p className="mt-1 text-sm text-muted">
            {members.data.length} {members.data.length === 1 ? "member" : "members"}
          </p>
        )}
      </header>

      {canManageTeam ? (
        <SettingsCard
          title="Invite a teammate"
          description="They'll get an email with a link to join. Invitations expire after 7 days."
        >
          <InviteMemberForm key={workspace.id} workspaceId={workspace.id} actorRole={role} />
        </SettingsCard>
      ) : (
        <Alert variant="info">Only admins and owners can invite or manage members.</Alert>
      )}

      <SettingsCard title="Members">
        {members.isPending && <PageLoader label="Loading members…" />}
        {members.isError && <Alert variant="error">{getErrorMessage(members.error)}</Alert>}
        {members.data && (
          <ul className="-my-4 divide-y divide-line">
            {members.data.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                actorRole={role}
                isSelf={member.user.id === user?.id}
                workspaceId={workspace.id}
                workspaceName={workspace.name}
              />
            ))}
          </ul>
        )}
      </SettingsCard>

      {canManageTeam && (
        <SettingsCard title="Pending invitations">
          <PendingInvitations workspaceId={workspace.id} />
        </SettingsCard>
      )}

      <SettingsCard title="Roles">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {WORKSPACE_ROLES.map((workspaceRole) => (
            <div key={workspaceRole}>
              <dt>
                <RoleBadge role={workspaceRole} />
              </dt>
              <dd className="mt-1 text-muted">{ROLE_DESCRIPTIONS[workspaceRole]}</dd>
            </div>
          ))}
        </dl>
      </SettingsCard>
    </div>
  );
}

export default TeamMembers;
