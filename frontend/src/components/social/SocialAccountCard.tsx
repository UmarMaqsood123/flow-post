import { CheckCheck, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import PlatformBadge from "@/components/shared/PlatformBadge";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  ACCOUNT_STATUS_DETAILS,
  describeTokenExpiry,
  PLATFORM_DETAILS,
  publishCapabilityLabels,
} from "@/config/socialPlatforms";
import { formatRelativeTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/forms";
import {
  useDisconnectSocialAccount,
  useTestSocialAccount,
} from "@/services/socialAccounts/useSocialAccounts";
import type { SocialAccount } from "@/types/socialAccount";

function AccountAvatar({ account }: { account: SocialAccount }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (account.profileImage && failedImage !== account.profileImage) {
    return (
      <img
        src={account.profileImage}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedImage(account.profileImage)}
        className="size-12 shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  return <PlatformBadge platform={account.platform} className="size-12 rounded-full text-sm" />;
}

interface SocialAccountCardProps {
  account: SocialAccount;
  workspaceId: string;
  platformName: string;
  canManage: boolean;
  canTest: boolean;
  onReconnect: () => void;
  isReconnecting: boolean;
  reconnectDisabled: boolean;
}

function SocialAccountCard({
  account,
  workspaceId,
  platformName,
  canManage,
  canTest,
  onReconnect,
  isReconnecting,
  reconnectDisabled,
}: SocialAccountCardProps) {
  const test = useTestSocialAccount(workspaceId);
  const disconnect = useDisconnectSocialAccount(workspaceId);
  const status = ACCOUNT_STATUS_DETAILS[account.status];
  const expiry = describeTokenExpiry(account.tokenExpiresAt);
  const needsReconnect = account.status === "REAUTH_REQUIRED" || account.status === "ERROR";
  const needsAttention = account.status !== "CONNECTED";
  const publishes = publishCapabilityLabels(account.capabilities);
  // Once the platform has rejected the token, its stored expiry time no longer means anything.
  const accessNeedsReconnect = account.status === "EXPIRED" || account.status === "REAUTH_REQUIRED";
  const accessLabel = accessNeedsReconnect ? "Reconnect required" : expiry.label;

  const handleDisconnect = () => {
    const revokeHint = PLATFORM_DETAILS[account.platform].revokeHint;
    const message = `Disconnect ${account.accountName}? FlowPost will delete its stored access and stop publishing to this account.${revokeHint ? `\n\n${revokeHint}` : ""}`;
    if (window.confirm(message)) disconnect.mutate(account.id);
  };

  return (
    <li className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <AccountAvatar account={account} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{account.accountName}</h3>
              <Badge tone={status.tone}>{status.label}</Badge>
              {account.status === "CONNECTED" && expiry.soon && (
                <Badge tone="warning">Expires soon</Badge>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span>{platformName}</span>
              {account.username && <span>@{account.username}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          {canTest && (
            <Button
              variant="secondary"
              className="px-3 py-1.5"
              onClick={() => test.mutate(account.id)}
              isLoading={test.isPending}
              disabled={needsReconnect}
            >
              {!test.isPending && <CheckCheck className="size-4" aria-hidden="true" />}
              Test connection
            </Button>
          )}
          {canManage && (
            <Button
              variant={needsAttention || expiry.soon ? "primary" : "secondary"}
              className="px-3 py-1.5"
              onClick={onReconnect}
              isLoading={isReconnecting}
              disabled={reconnectDisabled}
            >
              {!isReconnecting && <RefreshCw className="size-4" aria-hidden="true" />}
              Reconnect
            </Button>
          )}
          {canManage && (
            <Button
              variant="danger"
              className="px-3 py-1.5"
              onClick={handleDisconnect}
              isLoading={disconnect.isPending}
            >
              {!disconnect.isPending && <Trash2 className="size-4" aria-hidden="true" />}
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {needsAttention && (
        <Alert variant={account.status === "ERROR" ? "error" : "warning"} className="mt-4">
          {status.description}
          {account.lastError && (
            <span className="mt-1 block text-xs opacity-80">{account.lastError.message}</span>
          )}
        </Alert>
      )}
      {test.isSuccess && !needsAttention && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          The connection is working.
        </p>
      )}
      {/* When the test changed the status, the status box above already explains the problem. */}
      {test.isError && !needsAttention && (
        <Alert variant="error" className="mt-3">
          {getErrorMessage(test.error)}
        </Alert>
      )}
      {disconnect.isError && (
        <Alert variant="error" className="mt-3">
          {getErrorMessage(disconnect.error)}
        </Alert>
      )}

      <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Access</dt>
          <dd
            className={
              expiry.expired || accessNeedsReconnect ? "font-medium text-red-700" : undefined
            }
          >
            {accessLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Last checked</dt>
          <dd>{account.lastCheckedAt ? formatRelativeTime(account.lastCheckedAt) : "Never"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Can publish</dt>
          <dd>{publishes || "—"}</dd>
        </div>
      </dl>
    </li>
  );
}

export default SocialAccountCard;
