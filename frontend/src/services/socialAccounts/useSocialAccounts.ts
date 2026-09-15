import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { SocialAccount } from "@/types/socialAccount";
import { socialAccountsApi } from "./socialAccountsApi";

export function useSocialPlatforms(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.socialPlatforms(workspaceId ?? ""),
    queryFn: () => socialAccountsApi.listPlatforms(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });
}

export function useSocialAccounts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.socialAccounts(workspaceId ?? ""),
    queryFn: () => socialAccountsApi.listAccounts(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
}

/** Starts OAuth and sends the browser to the platform's consent page. */
export function useConnectSocialAccount() {
  return useMutation({
    mutationFn: socialAccountsApi.startConnection,
    onSuccess: ({ authorizationUrl }) => {
      if (new URL(authorizationUrl).protocol !== "https:") {
        throw new Error("Refusing to open a non-HTTPS authorization URL");
      }
      window.location.assign(authorizationUrl);
    },
  });
}

export function useDisconnectSocialAccount(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: socialAccountsApi.disconnect,
    onSuccess: (_data, accountId) =>
      queryClient.setQueryData<SocialAccount[]>(
        queryKeys.workspaces.socialAccounts(workspaceId),
        (accounts) => accounts?.filter((account) => account.id !== accountId),
      ),
  });
}

export function useTestSocialAccount(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.workspaces.socialAccounts(workspaceId);
  return useMutation({
    mutationFn: socialAccountsApi.test,
    onSuccess: ({ account }) =>
      queryClient.setQueryData<SocialAccount[]>(key, (accounts) =>
        accounts?.map((item) => (item.id === account.id ? account : item)),
      ),
    // A failed test can change the stored status (e.g. to EXPIRED); reload it.
    onError: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
