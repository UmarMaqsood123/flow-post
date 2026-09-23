import { api } from "@/lib/api";
import type {
  ConnectablePlatform,
  ConnectionChoices,
  SocialAccount,
  SocialPlatformInfo,
} from "@/types/socialAccount";

const workspaceAccountsPath = (workspaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/social-accounts`;

export const socialAccountsApi = {
  listPlatforms: async (workspaceId: string) =>
    (
      await api.get<{ platforms: SocialPlatformInfo[] }>(
        `${workspaceAccountsPath(workspaceId)}/platforms`,
      )
    ).data.platforms,

  listAccounts: async (workspaceId: string) =>
    (await api.get<{ accounts: SocialAccount[] }>(workspaceAccountsPath(workspaceId))).data
      .accounts,

  /** Returns the platform's consent URL. The API also sets an httpOnly cookie binding the attempt to this browser. */
  startConnection: async ({
    platform,
    workspaceId,
    method,
  }: {
    platform: ConnectablePlatform;
    workspaceId: string;
    /** A `LoginMethod` id, for platforms with more than one way to sign in. */
    method?: string;
  }) =>
    (
      await api.get<{ authorizationUrl: string; expiresAt: string }>(
        `/social-accounts/${platform.toLowerCase()}/connect`,
        { params: { workspaceId, method } },
      )
    ).data,

  /** The accounts a pending authorization could connect. */
  listConnectionChoices: async ({
    draftId,
    workspaceId,
  }: {
    draftId: string;
    workspaceId: string;
  }) =>
    (
      await api.get<ConnectionChoices>(
        `/social-accounts/connections/${encodeURIComponent(draftId)}`,
        { params: { workspaceId } },
      )
    ).data,

  chooseConnectionTarget: async ({
    draftId,
    workspaceId,
    targetId,
  }: {
    draftId: string;
    workspaceId: string;
    targetId: string;
  }) =>
    (
      await api.post<{ account: SocialAccount }, { targetId: string }>(
        `/social-accounts/connections/${encodeURIComponent(draftId)}`,
        { targetId },
        { params: { workspaceId } },
      )
    ).data.account,

  disconnect: async (accountId: string) => {
    await api.delete<null>(`/social-accounts/${encodeURIComponent(accountId)}`);
  },

  test: async (accountId: string) =>
    (
      await api.post<{ account: SocialAccount; checkedAt: string }>(
        `/social-accounts/${encodeURIComponent(accountId)}/test`,
      )
    ).data,
};
