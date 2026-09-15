import { Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import PlatformCard from "@/components/social/PlatformCard";
import SocialAccountCard from "@/components/social/SocialAccountCard";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import { CONNECT_ERROR_MESSAGES, platformNameFromSlug } from "@/config/socialPlatforms";
import { getErrorMessage } from "@/lib/forms";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import {
  useConnectSocialAccount,
  useSocialAccounts,
  useSocialPlatforms,
} from "@/services/socialAccounts/useSocialAccounts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useSwitchWorkspace from "@/services/workspace/useSwitchWorkspace";
import type { ConnectablePlatform } from "@/types/socialAccount";

interface Notice {
  variant: "success" | "error";
  message: string;
}

/** The API redirects here after OAuth with ?connected=1 or ?error=<reason>. */
const readRedirectNotice = (params: URLSearchParams): Notice | null => {
  const platformName = platformNameFromSlug(params.get("platform"));
  if (params.get("connected")) {
    return { variant: "success", message: `${platformName} account connected.` };
  }
  const error = params.get("error");
  if (error) {
    return {
      variant: "error",
      message: CONNECT_ERROR_MESSAGES[error] ?? CONNECT_ERROR_MESSAGES.failed ?? "",
    };
  }
  return null;
};

function SocialAccounts() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState(() => readRedirectNotice(searchParams));
  const switchWorkspace = useSwitchWorkspace();
  const platforms = useSocialPlatforms(workspaceId);
  const accounts = useSocialAccounts(workspaceId);
  const connect = useConnectSocialAccount();
  const handledRedirect = useRef(false);

  // After the OAuth redirect: show the connected workspace and tidy the URL.
  useEffect(() => {
    if (handledRedirect.current) return;
    handledRedirect.current = true;
    const connectedWorkspace = searchParams.get("workspaceId");
    if (connectedWorkspace && workspaceId && connectedWorkspace !== workspaceId) {
      switchWorkspace.mutate(connectedWorkspace);
    }
    if (searchParams.has("connected") || searchParams.has("error")) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, switchWorkspace, workspaceId]);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current || !workspaceId) return null;

  const canManage = hasMinimumRole(current.role, "ADMIN");
  const canTest = hasMinimumRole(current.role, "EDITOR");
  const accountList = accounts.data ?? [];
  const platformList = platforms.data ?? [];
  const platformInfo = (platform: ConnectablePlatform) =>
    platformList.find((item) => item.platform === platform);
  const isConnecting = (platform: ConnectablePlatform) =>
    connect.isPending && connect.variables?.platform === platform;
  const startConnection = (platform: ConnectablePlatform) => {
    setNotice(null);
    connect.mutate({ platform, workspaceId });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Social accounts"
        description={`Connect the profiles ${current.workspace.name} publishes to. Access tokens are stored encrypted on FlowPost's servers and never sent to your browser.`}
      />

      {notice && (
        <Alert variant={notice.variant}>
          <div className="flex items-start justify-between gap-3">
            <span>{notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-black/5"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </Alert>
      )}
      {connect.isError && <Alert variant="error">{getErrorMessage(connect.error)}</Alert>}
      {!canManage && (
        <Alert variant="info">
          Only admins and owners can connect, reconnect or disconnect accounts.
        </Alert>
      )}

      <section aria-labelledby="connected-accounts-heading" className="flex flex-col gap-4">
        <h2 id="connected-accounts-heading" className="text-lg font-semibold">
          Connected accounts
        </h2>
        <AsyncContent
          isLoading={accounts.isPending}
          error={accounts.error}
          errorTitle="We couldn't load connected accounts"
          onRetry={() => void accounts.refetch()}
          isRetrying={accounts.isRefetching}
          isEmpty={accountList.length === 0}
          loading={
            <div className="flex flex-col gap-3">
              {[0, 1].map((item) => (
                <Skeleton key={item} className="h-36 rounded-xl" />
              ))}
            </div>
          }
          empty={
            <EmptyState
              icon={Share2}
              title="No accounts connected yet"
              description={
                canManage
                  ? "Connect LinkedIn below to publish posts from FlowPost."
                  : "An admin or owner can connect accounts for this workspace."
              }
            />
          }
        >
          <ul className="flex flex-col gap-3">
            {accountList.map((account) => (
              <SocialAccountCard
                key={account.id}
                account={account}
                workspaceId={workspaceId}
                platformName={platformInfo(account.platform)?.displayName ?? account.platform}
                canManage={canManage}
                canTest={canTest}
                onReconnect={() => startConnection(account.platform)}
                isReconnecting={isConnecting(account.platform)}
                reconnectDisabled={connect.isPending || !platformInfo(account.platform)?.available}
              />
            ))}
          </ul>
        </AsyncContent>
      </section>

      <section aria-labelledby="platforms-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="platforms-heading" className="text-lg font-semibold">
            Platforms
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            LinkedIn is available now. More platforms are on the way.
          </p>
        </div>
        <AsyncContent
          isLoading={platforms.isPending}
          error={platforms.error}
          errorTitle="We couldn't load platforms"
          onRetry={() => void platforms.refetch()}
          isRetrying={platforms.isRefetching}
          loading={
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-40 rounded-xl" />
              ))}
            </div>
          }
        >
          <ul className="grid gap-4 lg:grid-cols-2">
            {platformList.map((platform) => (
              <PlatformCard
                key={platform.platform}
                platform={platform}
                connectedCount={
                  accountList.filter((account) => account.platform === platform.platform).length
                }
                canManage={canManage}
                isConnecting={isConnecting(platform.platform)}
                disabled={connect.isPending}
                onConnect={() => startConnection(platform.platform)}
              />
            ))}
          </ul>
        </AsyncContent>
      </section>
    </div>
  );
}

export default SocialAccounts;
