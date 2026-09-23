import toast from "react-hot-toast";
import { Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import ConnectionChoice from "@/components/social/ConnectionChoice";
import PlatformCard from "@/components/social/PlatformCard";
import SocialAccountCard from "@/components/social/SocialAccountCard";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import {
  CONNECT_ERROR_MESSAGES,
  platformNameFromSlug,
  reconnectLoginMethod,
} from "@/config/socialPlatforms";
import { getErrorMessage } from "@/lib/forms";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import {
  useChooseConnectionTarget,
  useConnectionChoices,
  useConnectSocialAccount,
  useSocialAccounts,
  useSocialPlatforms,
} from "@/services/socialAccounts/useSocialAccounts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useSwitchWorkspace from "@/services/workspace/useSwitchWorkspace";
import type { ConnectablePlatform } from "@/types/socialAccount";
import { notify } from "@/lib/toast";

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
  // Set when the callback granted several accounts and the user has to choose.
  const [draftId, setDraftId] = useState(() => searchParams.get("choose"));
  const switchWorkspace = useSwitchWorkspace();
  const platforms = useSocialPlatforms(workspaceId);
  const accounts = useSocialAccounts(workspaceId);
  const connect = useConnectSocialAccount();
  const choices = useConnectionChoices(workspaceId, draftId);
  const chooseTarget = useChooseConnectionTarget(workspaceId ?? "");
  const handledRedirect = useRef(false);

  // After the OAuth redirect: show the connected workspace and tidy the URL.
  useEffect(() => {
    if (handledRedirect.current) return;
    handledRedirect.current = true;
    // The platform sent the user back here: report how the connection went.
    const redirectNotice = readRedirectNotice(searchParams);
    if (redirectNotice?.variant === "success")
      notify.success(redirectNotice.message, "social-connect");
    else if (redirectNotice) toast.error(redirectNotice.message, { id: "social-connect" });
    const connectedWorkspace = searchParams.get("workspaceId");
    if (connectedWorkspace && workspaceId && connectedWorkspace !== workspaceId) {
      switchWorkspace.mutate(connectedWorkspace);
    }
    if (searchParams.has("connected") || searchParams.has("error") || searchParams.has("choose")) {
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
  const connectingFor = (platform: ConnectablePlatform) =>
    connect.isPending && connect.variables?.platform === platform
      ? { method: connect.variables.method }
      : null;
  const isConnecting = (platform: ConnectablePlatform) => connectingFor(platform) !== null;
  const startConnection = (platform: ConnectablePlatform, method?: string) => {
    connect.mutate(
      { platform, workspaceId, method },
      { onError: (error) => notify.error(error, undefined, "social-connect") },
    );
  };

  const platformName = choices.data
    ? (platformInfo(choices.data.platform)?.displayName ?? choices.data.platform)
    : "";

  const connectChosen = (targetId: string) => {
    if (!draftId) return;
    chooseTarget.mutate(
      { draftId, workspaceId, targetId },
      {
        onSuccess: (account) => {
          setDraftId(null);
          notify.success(`${account.accountName} connected.`, "social-connect");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Social accounts"
        description={`Connect the profiles ${current.workspace.name} publishes to. Access tokens are stored encrypted on FlowPost's servers and never sent to your browser.`}
      />

      {draftId &&
        (choices.isError ? (
          <Alert variant="error">{getErrorMessage(choices.error)}</Alert>
        ) : (
          <ConnectionChoice
            platformName={platformName}
            targets={choices.data?.targets ?? []}
            isLoading={choices.isPending}
            isSaving={chooseTarget.isPending}
            error={chooseTarget.error}
            onConnect={connectChosen}
            onCancel={() => setDraftId(null)}
          />
        ))}
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
                // Reconnect the way it was connected: an Instagram account signed in
                // directly has no Facebook Page to come back through.
                onReconnect={() => startConnection(account.platform, reconnectLoginMethod(account))}
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
                connecting={connectingFor(platform.platform)}
                disabled={connect.isPending}
                onConnect={(method) => startConnection(platform.platform, method)}
              />
            ))}
          </ul>
        </AsyncContent>
      </section>
    </div>
  );
}

export default SocialAccounts;
