import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import ActivityLog from "@/components/autopilot/ActivityLog";
import UpgradeNotice from "@/components/billing/UpgradeNotice";
import AutopilotSettingsForm from "@/components/autopilot/AutopilotSettingsForm";
import ReviewQueue from "@/components/autopilot/ReviewQueue";
import SlotList from "@/components/autopilot/SlotList";
import { ConfirmModal } from "@/components/modals";
import AsyncContent from "@/components/shared/AsyncContent";
import PageHeader from "@/components/shared/PageHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { platformLabel } from "@/config/post";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import {
  useAutopilot,
  usePauseAutopilot,
  useStartAutopilot,
  useUpdateAutopilotSettings,
} from "@/services/autopilot/useAutopilot";
import {
  useContentStrategies,
  useContentStrategy,
} from "@/services/contentStrategy/useContentStrategies";
import { useSocialAccounts } from "@/services/socialAccounts/useSocialAccounts";
import useSession from "@/services/auth/useSession";
import { useWorkspaceEntitlements } from "@/services/billing/useBilling";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { AutopilotOverview } from "@/types/autopilot";
import { notify } from "@/lib/toast";

const TABS = ["queue", "schedule", "settings", "activity"] as const;
type Tab = (typeof TABS)[number];

function StatusPanel({ overview, timeZone }: { overview: AutopilotOverview; timeZone: string }) {
  const { settings, readyProblems } = overview;
  const next = overview.slots.find(
    (slot) => slot.status === "PLANNED" && new Date(slot.scheduledAt) > new Date(),
  );

  if (settings.status === "ACTIVE") {
    return (
      <Alert variant="success" title="Autopilot is running">
        {settings.approvalRequired
          ? "Posts wait for approval before they're scheduled."
          : "Posts that pass the checks are scheduled and published automatically."}
        {next && ` Next posting time: ${formatDateTime(next.scheduledAt, timeZone)}.`}
      </Alert>
    );
  }
  if (settings.status === "PAUSED") {
    return (
      <Alert
        variant={settings.pausedBySystem ? "error" : "warning"}
        title={settings.pausedBySystem ? "Autopilot paused itself" : "Autopilot is paused"}
      >
        {settings.pauseReason ?? "Nothing new is written or published until it's resumed."}
        {settings.pausedAt && ` Paused ${formatDateTime(settings.pausedAt, timeZone)}.`}
      </Alert>
    );
  }
  return (
    <Alert variant="info" title="Autopilot is off">
      {readyProblems.length > 0
        ? `Set it up first: ${readyProblems.join(" ")}`
        : "Review the settings, then start it."}
    </Alert>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Autopilot() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id;
  const overview = useAutopilot(workspaceId);
  const accounts = useSocialAccounts(workspaceId);
  const strategies = useContentStrategies(workspaceId);
  const activeId = strategies.data?.find((item) => item.status === "ACTIVE")?.id;
  const activeStrategy = useContentStrategy(workspaceId, activeId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isStartOpen, setIsStartOpen] = useState(false);
  const session = useSession();
  const entitlements = useWorkspaceEntitlements(workspaceId);

  const start = useStartAutopilot(workspaceId ?? "");
  const pause = usePauseAutopilot(workspaceId ?? "");
  const save = useUpdateAutopilotSettings(workspaceId ?? "");

  if (!current || !workspaceId) return null;
  const timeZone = current.workspace.timezone ?? "UTC";
  const isAdmin = hasMinimumRole(current.role, "ADMIN");
  const isEditor = hasMinimumRole(current.role, "EDITOR");

  const data = overview.data;
  const status = data?.settings.status;
  const requested = searchParams.get("tab") as Tab | null;
  const tab: Tab =
    requested && TABS.includes(requested)
      ? requested
      : status === "OFF"
        ? "settings"
        : (data?.queue.length ?? 0) > 0
          ? "queue"
          : "schedule";
  const setTab = (next: Tab) =>
    setSearchParams(
      (params) => {
        params.set("tab", next);
        return params;
      },
      { replace: true },
    );

  const tabLabels: Record<Tab, string> = {
    queue: `Review queue${data?.queue.length ? ` (${data.queue.length})` : ""}`,
    schedule: "Schedule",
    settings: "Settings",
    activity: "Activity",
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Autopilot"
        description="Chooses topics, writes posts for each platform, checks them for repeats and quality, and schedules them."
        actions={
          data && (
            <>
              {status === "ACTIVE" && isEditor && (
                <Button
                  variant="danger"
                  isLoading={pause.isPending}
                  onClick={() =>
                    pause.mutate(undefined, {
                      onSuccess: () => notify.success("Autopilot paused.", "autopilot-status"),
                      onError: (error) => notify.error(error, undefined, "autopilot-status"),
                    })
                  }
                >
                  {!pause.isPending && <Pause className="size-4" aria-hidden="true" />}
                  Pause Autopilot
                </Button>
              )}
              {status !== "ACTIVE" && isAdmin && data.plan.included && (
                <Button
                  onClick={() => {
                    start.reset();
                    setIsStartOpen(true);
                  }}
                  disabled={data.readyProblems.length > 0}
                >
                  <Play className="size-4" aria-hidden="true" />
                  {status === "PAUSED" ? "Resume Autopilot" : "Start Autopilot"}
                </Button>
              )}
            </>
          )
        }
      />

      <AsyncContent
        isLoading={overview.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={overview.isError ? overview.error : undefined}
        errorTitle="We couldn't load Autopilot"
        onRetry={() => void overview.refetch()}
        isRetrying={overview.isRefetching}
      >
        {data && (
          <div className="flex flex-col gap-6">
            {!data.plan.included && (
              <UpgradeNotice
                title={`Autopilot isn't included in the ${data.plan.label} plan`}
                description="Upgrade to let Autopilot choose topics, write posts for each platform and schedule them, with the repeat and quality checks and approvals you set."
                canManage={session.data?.id === entitlements.data?.billingOwnerId}
              />
            )}
            <StatusPanel overview={data} timeZone={timeZone} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Awaiting review" value={data.stats.awaitingReview} />
              <Stat label="Published, 7 days" value={data.stats.publishedLast7Days} />
              <Stat label="Failures, 7 days" value={data.stats.failuresLast7Days} />
              <Stat
                label="Plan"
                value={`${data.plan.label} · ${data.plan.autopilotPostsPerWeek}/wk`}
              />
            </div>

            <div
              role="tablist"
              aria-label="Autopilot sections"
              className="flex gap-1 overflow-x-auto border-b border-line"
            >
              {TABS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`autopilot-tab-${value}`}
                  aria-selected={tab === value}
                  aria-controls={`autopilot-panel-${value}`}
                  onClick={() => setTab(value)}
                  className={cn(
                    "-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                    tab === value
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {tabLabels[value]}
                </button>
              ))}
            </div>

            <section
              role="tabpanel"
              id={`autopilot-panel-${tab}`}
              aria-labelledby={`autopilot-tab-${tab}`}
              className="rounded-xl border border-line bg-surface p-4 sm:p-6"
            >
              {tab === "queue" && (
                <ReviewQueue
                  items={data.queue}
                  workspaceId={workspaceId}
                  timeZone={timeZone}
                  canDecide={isEditor}
                />
              )}
              {tab === "schedule" && (
                <SlotList
                  slots={data.slots}
                  workspaceId={workspaceId}
                  timeZone={timeZone}
                  canRetry={isAdmin}
                />
              )}
              {tab === "settings" && (
                <div className="flex flex-col gap-4">
                  {!isAdmin && (
                    <Alert variant="info">
                      Only admins and owners can change Autopilot settings.
                    </Alert>
                  )}
                  <AutopilotSettingsForm
                    key={data.settings.updatedAt ?? "new"}
                    overview={data}
                    accounts={accounts.data ?? []}
                    strategyPillars={
                      activeStrategy.data?.content.contentPillars.map((pillar) => pillar.name) ?? []
                    }
                    canEdit={isAdmin}
                    isSaving={save.isPending}
                    error={save.error}
                    onSave={(payload) =>
                      save.mutate(payload, {
                        onSuccess: () =>
                          notify.success(
                            "Settings saved. Planned posting times that hadn't started were replanned.",
                          ),
                      })
                    }
                  />
                </div>
              )}
              {tab === "activity" && <ActivityLog workspaceId={workspaceId} timeZone={timeZone} />}
            </section>
          </div>
        )}
      </AsyncContent>

      {data && (
        <ConfirmModal
          open={isStartOpen}
          title={status === "PAUSED" ? "Resume Autopilot?" : "Start Autopilot?"}
          message={
            <div className="flex flex-col gap-2">
              <p>
                Autopilot will write {data.settings.postsPerWeek} posts a week for{" "}
                {data.settings.platforms.map(platformLabel).join(", ")}, as you.
              </p>
              <p>
                {data.settings.approvalRequired
                  ? "Every post waits for approval before it's scheduled."
                  : "Posts that pass the checks will publish without anyone reviewing them."}
              </p>
              {status === "PAUSED" && (
                <p>Posts taken off the schedule during the pause stay in the review queue.</p>
              )}
            </div>
          }
          confirmLabel={status === "PAUSED" ? "Resume" : "Start"}
          isLoading={start.isPending}
          error={start.error}
          onConfirm={() =>
            start.mutate(undefined, {
              onSuccess: () => {
                setIsStartOpen(false);
                notify.success(
                  status === "PAUSED" ? "Autopilot resumed." : "Autopilot started.",
                  "autopilot-status",
                );
              },
            })
          }
          onClose={() => setIsStartOpen(false)}
        />
      )}
    </div>
  );
}

export default Autopilot;
