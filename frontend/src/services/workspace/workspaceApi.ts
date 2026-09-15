import { api } from "@/lib/api";
import type {
  InvitableRole,
  InvitationPreview,
  WorkspaceInvitation,
  WorkspaceList,
  WorkspaceMember,
  WorkspacePayload,
  WorkspaceRole,
  WorkspaceSummary,
} from "@/types/workspace";

const workspacePath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;

export interface MemberRef {
  workspaceId: string;
  memberId: string;
}

export const workspaceApi = {
  list: async () => (await api.get<WorkspaceList>("/workspaces")).data,

  create: async (payload: WorkspacePayload) =>
    (await api.post<WorkspaceSummary>("/workspaces", payload)).data,

  update: async ({
    workspaceId,
    payload,
  }: {
    workspaceId: string;
    payload: Partial<WorkspacePayload>;
  }) => (await api.patch<WorkspaceSummary>(workspacePath(workspaceId), payload)).data,

  archive: async (workspaceId: string) => {
    await api.delete<null>(workspacePath(workspaceId));
  },

  deletePermanently: async ({
    workspaceId,
    confirmName,
  }: {
    workspaceId: string;
    confirmName: string;
  }) => {
    await api.delete<null>(`${workspacePath(workspaceId)}/permanent`, {
      data: { confirmName },
    });
  },

  restore: async (workspaceId: string) =>
    (await api.post<WorkspaceSummary>(`${workspacePath(workspaceId)}/restore`)).data,

  switch: async (workspaceId: string) =>
    (await api.post<WorkspaceSummary>(`${workspacePath(workspaceId)}/switch`)).data,

  listMembers: async (workspaceId: string) =>
    (await api.get<{ members: WorkspaceMember[] }>(`${workspacePath(workspaceId)}/members`)).data
      .members,

  changeMemberRole: async ({ workspaceId, memberId, role }: MemberRef & { role: WorkspaceRole }) =>
    (
      await api.patch<{ member: WorkspaceMember }>(
        `${workspacePath(workspaceId)}/members/${encodeURIComponent(memberId)}`,
        { role },
      )
    ).data.member,

  removeMember: async ({ workspaceId, memberId }: MemberRef) => {
    await api.delete<null>(`${workspacePath(workspaceId)}/members/${encodeURIComponent(memberId)}`);
  },

  listInvitations: async (workspaceId: string) =>
    (
      await api.get<{ invitations: WorkspaceInvitation[] }>(
        `${workspacePath(workspaceId)}/invitations`,
      )
    ).data.invitations,

  inviteMember: async ({
    workspaceId,
    email,
    role,
  }: {
    workspaceId: string;
    email: string;
    role: InvitableRole;
  }) =>
    (
      await api.post<{ invitation: WorkspaceInvitation }>(
        `${workspacePath(workspaceId)}/invitations`,
        { email, role },
      )
    ).data.invitation,

  revokeInvitation: async ({
    workspaceId,
    invitationId,
  }: {
    workspaceId: string;
    invitationId: string;
  }) => {
    await api.delete<null>(
      `${workspacePath(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
    );
  },

  previewInvitation: async (token: string) =>
    (
      await api.get<{ invitation: InvitationPreview }>("/workspaces/invitations/preview", {
        params: { token },
      })
    ).data.invitation,

  acceptInvitation: async (token: string) =>
    (await api.post<WorkspaceSummary>("/workspaces/invitations/accept", { token })).data,
};
