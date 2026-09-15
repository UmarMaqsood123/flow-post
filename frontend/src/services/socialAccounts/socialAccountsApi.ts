import { api } from "@/lib/api";
import type { ConnectablePlatform, SocialAccount, SocialPlatformInfo } from "@/types/socialAccount";

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
  }: {
    platform: ConnectablePlatform;
    workspaceId: string;
  }) =>
    (
      await api.get<{ authorizationUrl: string; expiresAt: string }>(
        `/social-accounts/${platform.toLowerCase()}/connect`,
        { params: { workspaceId } },
      )
    ).data,

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
