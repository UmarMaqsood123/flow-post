import { CheckCircle2, Minus, Plus } from "lucide-react";
import PlatformBadge from "@/components/shared/PlatformBadge";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { PLATFORM_DETAILS } from "@/config/socialPlatforms";
import type { SocialPlatformInfo } from "@/types/socialAccount";

interface PlatformCardProps {
  platform: SocialPlatformInfo;
  connectedCount: number;
  canManage: boolean;
  /** Whether a connection is starting, and with which login method (undefined for the default). */
  connecting: { method: string | undefined } | null;
  disabled: boolean;
  onConnect: (method?: string) => void;
}

function PlatformCard({
  platform,
  connectedCount,
  canManage,
  connecting,
  disabled,
  onConnect,
}: PlatformCardProps) {
  const details = PLATFORM_DETAILS[platform.platform];
  // Platforms with a choice of sign-in (Instagram) get a button per configured method.
  const methods = platform.loginMethods
    .filter((method) => method.available)
    .map((method) => ({ ...method, details: details.loginMethods?.[method.id] }));
  const showMethods = methods.length > 1;

  const status = !details.implemented ? (
    <Badge>Coming soon</Badge>
  ) : !platform.available ? (
    <Badge tone="warning">Not configured</Badge>
  ) : connectedCount > 0 ? (
    <Badge tone="success">{connectedCount} connected</Badge>
  ) : (
    <Badge tone="primary">Available</Badge>
  );

  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <PlatformBadge platform={platform.platform} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{platform.displayName}</h3>
            {status}
          </div>
          <p className="mt-1 text-sm text-muted">{details.description}</p>
        </div>
      </div>

      {details.implemented && (
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Supported</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {details.supported.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-green-600"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Not available
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-muted">
              {details.unsupported.map((item) => (
                <li key={item} className="flex gap-2">
                  <Minus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {details.implemented && !platform.available && details.setupHint && (
        <p className="mt-4 text-xs text-muted">{details.setupHint}</p>
      )}

      {details.implemented && platform.available && showMethods && (
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {methods.map((method, index) => {
              const isConnecting = connecting?.method === method.id;
              return (
                <Button
                  key={method.id}
                  variant={index === 0 ? "primary" : "secondary"}
                  onClick={() => onConnect(method.id)}
                  isLoading={isConnecting}
                  disabled={disabled || !canManage}
                >
                  {!isConnecting && index === 0 && <Plus className="size-4" aria-hidden="true" />}
                  {method.details?.buttonLabel ?? `Connect with ${method.label}`}
                </Button>
              );
            })}
          </div>
          <ul className="flex flex-col gap-1 text-xs text-muted">
            {methods.map(
              (method) =>
                method.details && (
                  <li key={method.id}>
                    <span className="font-medium text-ink">{method.details.buttonLabel}:</span>{" "}
                    {method.details.hint}
                  </li>
                ),
            )}
          </ul>
          {!canManage && (
            <span className="text-xs text-muted">Admins and owners can connect accounts.</span>
          )}
        </div>
      )}

      {details.implemented && platform.available && !showMethods && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => onConnect(methods[0]?.id)}
            isLoading={connecting !== null}
            disabled={disabled || !canManage}
          >
            {connecting === null && <Plus className="size-4" aria-hidden="true" />}
            {connectedCount > 0 ? "Connect another" : `Connect ${platform.displayName}`}
          </Button>
          {methods[0]?.details && (
            <span className="text-xs text-muted">{methods[0].details.hint}</span>
          )}
          {!canManage && (
            <span className="text-xs text-muted">Admins and owners can connect accounts.</span>
          )}
        </div>
      )}
    </li>
  );
}

export default PlatformCard;
