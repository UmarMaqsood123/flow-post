import { Clock, ExternalLink, Layers, RefreshCw, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import EngagementChart from "@/components/analytics/EngagementChart";
import RangeFilter, { type RangeState } from "@/components/analytics/RangeFilter";
import UpgradeNotice from "@/components/billing/UpgradeNotice";
import WidgetCard from "@/components/dashboard/WidgetCard";
import PerformanceInsights from "@/components/insights/PerformanceInsights";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import { platformLabel } from "@/config/post";
import { formatCompactNumber } from "@/lib/format";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import { useAnalytics, useRefreshAnalytics } from "@/services/analytics/useAnalytics";
import useSession from "@/services/auth/useSession";
import { useWorkspaceEntitlements } from "@/services/billing/useBilling";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { AnalyticsMetric, AnalyticsQuery, AnalyticsReport } from "@/types/analytics";
import { notify } from "@/lib/toast";

/** The headline metrics, in the order they're shown. */
const HEADLINE: { metric: AnalyticsMetric; label: string }[] = [
  { metric: "views", label: "Views" },
  { metric: "reach", label: "Reach" },
  { metric: "impressions", label: "Impressions" },
  { metric: "clicks", label: "Clicks" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toQuery = (state: RangeState): AnalyticsQuery =>
  state.range === "custom"
    ? {
        range: "custom",
        from: state.from ? new Date(`${state.from}T00:00:00`).toISOString() : undefined,
        to: state.to ? new Date(`${state.to}T23:59:59`).toISOString() : undefined,
      }
    : { range: state.range };

function MetricTile({
  label,
  value,
  available,
}: {
  label: string;
  value: number | undefined;
  available: boolean;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      {available ? (
        <p className="mt-1 text-xl font-semibold tabular-nums">{formatCompactNumber(value ?? 0)}</p>
      ) : (
        // A platform that doesn't report a metric must not look like a zero.
        <p className="mt-1 text-sm text-muted">Not reported</p>
      )}
    </div>
  );
}

function Report({ report, timeZone }: { report: AnalyticsReport; timeZone: string }) {
  const { totals, availableMetrics } = report;
  const has = (metric: AnalyticsMetric) => availableMetrics.includes(metric);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Total engagement</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {formatCompactNumber(totals.engagement)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Likes, comments, shares and saves, counting only what each platform reports.
          </p>
        </div>
        {HEADLINE.map(({ metric, label }) => (
          <MetricTile
            key={metric}
            label={label}
            value={totals.totals[metric]}
            available={has(metric)}
          />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <WidgetCard title="Engagement over time">
          <EngagementChart series={report.series} metric="engagement" />
        </WidgetCard>
        <WidgetCard title="Views over time">
          <EngagementChart series={report.series} metric="views" />
        </WidgetCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <WidgetCard title="Follower growth">
          {report.followerGrowth.length === 0 ? (
            <p className="text-sm text-muted">
              Follower counts appear once metrics have been collected on more than one day.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {report.followerGrowth.map((row) => (
                <li key={`${row.platform}-${row.accountName}`} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{row.accountName}</span>
                    <span className="text-sm tabular-nums">
                      {row.last === null ? "—" : formatCompactNumber(row.last)}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {platformLabel(row.platform)}
                    {row.change === null
                      ? " · not enough readings yet"
                      : ` · ${row.change >= 0 ? "+" : ""}${row.change.toLocaleString()} in this range`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard title="Best platform" icon={TrendingUp}>
          {report.bestPlatform ? (
            <div>
              <p className="text-2xl font-semibold">
                {platformLabel(report.bestPlatform.platform)}
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatCompactNumber(report.bestPlatform.engagement)} engagement across{" "}
                {report.bestPlatform.posts} {report.bestPlatform.posts === 1 ? "post" : "posts"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Nothing measured yet.</p>
          )}
        </WidgetCard>

        <WidgetCard title="Best content pillar" icon={Layers}>
          {report.bestPillar ? (
            <div>
              <p className="text-2xl font-semibold">{report.bestPillar.pillar}</p>
              <p className="mt-1 text-sm text-muted">
                {formatCompactNumber(report.bestPillar.engagement)} engagement across{" "}
                {report.bestPillar.posts} {report.bestPillar.posts === 1 ? "post" : "posts"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Posts need a content pillar before this can be worked out.
            </p>
          )}
        </WidgetCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <WidgetCard title="Top posts">
          {report.topPosts.length === 0 ? (
            <p className="text-sm text-muted">No posts with metrics in this range.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {report.topPosts.map((post) => (
                <li key={post.postId} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{post.topic || "Untitled post"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge>{platformLabel(post.platform)}</Badge>
                      {post.pillar && <span>{post.pillar}</span>}
                      {post.url && (
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
                        >
                          <ExternalLink className="size-3" aria-hidden="true" />
                          View
                        </a>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCompactNumber(post.engagement)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </WidgetCard>

        <WidgetCard title="Best posting times" icon={Clock}>
          {report.bestTimes.length === 0 ? (
            <p className="text-sm text-muted">
              This needs a few published posts before a pattern means anything.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {report.bestTimes.map((slot) => (
                  <li
                    key={`${slot.weekday}-${slot.hour}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      {WEEKDAYS[slot.weekday]} at {String(slot.hour).padStart(2, "0")}:00
                    </span>
                    <span className="text-muted tabular-nums">
                      {formatCompactNumber(slot.engagement)} from {slot.posts}{" "}
                      {slot.posts === 1 ? "post" : "posts"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Times are UTC. Your workspace runs on {timeZone.replaceAll("_", " ")}.
              </p>
            </>
          )}
        </WidgetCard>
      </div>

      {report.platformNotes.map((note) => (
        <Alert key={note.platform} variant="info">
          <strong>{platformLabel(note.platform)}:</strong> {note.note}
        </Alert>
      ))}
    </div>
  );
}

function Analytics() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id;
  const [state, setState] = useState<RangeState>({ range: "30d", from: "", to: "" });
  const query = toQuery(state);
  const entitlements = useWorkspaceEntitlements(workspaceId);
  const session = useSession();
  const included = entitlements.data?.features.analytics === true;
  // Nothing is requested until the plan is known to include analytics.
  const report = useAnalytics(included ? workspaceId : undefined, query);
  const refresh = useRefreshAnalytics(workspaceId ?? "");

  if (!current || !workspaceId) return null;
  const canRefresh = hasMinimumRole(current.role, "EDITOR");

  if (entitlements.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (entitlements.data && !included) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader title="Analytics" />
        <UpgradeNotice
          title={`Analytics isn't included in the ${entitlements.data.label} plan`}
          description="Upgrade to see how your published posts perform across platforms, with weekly AI recommendations based on your real results."
          canManage={session.data?.id === entitlements.data.billingOwnerId}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="How your published posts performed, using only the numbers each platform reports."
        actions={
          canRefresh && (
            <Button
              variant="secondary"
              onClick={() =>
                refresh.mutate(undefined, {
                  onSuccess: ({ collected }) =>
                    notify.success(
                      collected > 0 ? "Analytics updated." : "Up to date. Nothing new to collect.",
                      "analytics-refresh",
                    ),
                  onError: (error) => notify.error(error, undefined, "analytics-refresh"),
                })
              }
              isLoading={refresh.isPending}
            >
              {!refresh.isPending && <RefreshCw className="size-4" aria-hidden="true" />}
              Refresh
            </Button>
          )
        }
      />

      <RangeFilter value={state} onChange={setState} disabled={report.isFetching} />

      <AsyncContent
        isLoading={report.isPending}
        loading={<Skeleton className="h-96 rounded-xl" />}
        error={report.isError ? report.error : undefined}
        errorTitle="We couldn't load analytics"
        onRetry={() => void report.refetch()}
        isRetrying={report.isRefetching}
      >
        {report.data?.isEmpty ? (
          <EmptyState
            icon={Users}
            title="No metrics yet"
            description="Metrics are collected a few times a day for posts FlowPost has published. Once a post goes out, its numbers show up here."
            action={
              <Link
                to={paths.calendar}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Open the calendar
              </Link>
            }
          />
        ) : (
          report.data && (
            <Report report={report.data} timeZone={current.workspace.timezone ?? "UTC"} />
          )
        )}
      </AsyncContent>

      <PerformanceInsights
        workspaceId={workspaceId}
        canGenerate={canRefresh}
        canDecide={hasMinimumRole(current.role, "ADMIN")}
      />
    </div>
  );
}

export default Analytics;
