import { Calculator, Check, Lightbulb, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import AsyncContent from "@/components/shared/AsyncContent";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { formatCompactNumber, formatShortDay } from "@/lib/format";
import {
  useDecideInsight,
  useGenerateInsights,
  useInsightReport,
  useInsightsOverview,
} from "@/services/insights/useInsights";
import {
  type FactConfidence,
  INSIGHT_CATEGORY_LABELS,
  type InsightCategory,
  type InsightReport,
  type InsightStatus,
  type PerformanceFact,
  type PerformanceInsight,
} from "@/types/insights";
import Dropdown from "@/components/ui/Dropdown";
import { notify } from "@/lib/toast";

const CONFIDENCE_TONE: Record<FactConfidence, "success" | "warning" | "neutral"> = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "neutral",
};

const CONFIDENCE_HINT: Record<FactConfidence, string> = {
  HIGH: "5 or more posts",
  MEDIUM: "3 to 4 posts",
  LOW: "fewer than 3 posts",
};

const STATUS_BADGE: Record<
  InsightStatus,
  { tone: "success" | "neutral" | "primary"; label: string }
> = {
  PENDING: { tone: "primary", label: "Waiting for review" },
  APPROVED: { tone: "success", label: "Approved, guiding AI writing" },
  DISMISSED: { tone: "neutral", label: "Dismissed" },
};

const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;

/** One calculated row. Every figure shown comes from the fact, never from AI text. */
function FactRow({ fact }: { fact: PerformanceFact }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-3">
        <span className="font-medium">{fact.label}</span>
      </td>
      <td className="py-2 pr-3 tabular-nums">{fact.posts}</td>
      <td className="py-2 pr-3 tabular-nums">{formatCompactNumber(fact.avgEngagement)}</td>
      <td className="py-2 pr-3 tabular-nums">
        {fact.liftVsAverage === null ? "—" : `${fact.liftVsAverage}×`}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {fact.avgViews === null ? "Not reported" : formatCompactNumber(fact.avgViews)}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {fact.engagementRate === null ? "—" : percent(fact.engagementRate)}
      </td>
      <td className="py-2">
        <span title={CONFIDENCE_HINT[fact.confidence]}>
          <Badge tone={CONFIDENCE_TONE[fact.confidence]}>{fact.confidence.toLowerCase()}</Badge>
        </span>
      </td>
    </tr>
  );
}

function FactTable({ facts }: { facts: PerformanceFact[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="pr-3 pb-1.5 font-medium">Group</th>
            <th className="pr-3 pb-1.5 font-medium">Posts</th>
            <th className="pr-3 pb-1.5 font-medium">Avg engagement</th>
            <th className="pr-3 pb-1.5 font-medium">Vs average</th>
            <th className="pr-3 pb-1.5 font-medium">Avg views</th>
            <th className="pr-3 pb-1.5 font-medium">Eng. rate</th>
            <th className="pb-1.5 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightCard({
  insight,
  facts,
  canDecide,
  isDeciding,
  onDecide,
}: {
  insight: PerformanceInsight;
  facts: Map<string, PerformanceFact>;
  canDecide: boolean;
  isDeciding: boolean;
  onDecide: (status: InsightStatus) => void;
}) {
  const cited = insight.factIds.flatMap((id) => facts.get(id) ?? []);
  const badge = STATUS_BADGE[insight.status];

  return (
    <article
      className={
        insight.status === "DISMISSED"
          ? "rounded-xl border border-line bg-surface p-4 opacity-70 sm:p-5"
          : "rounded-xl border border-line bg-surface p-4 sm:p-5"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {INSIGHT_CATEGORY_LABELS[insight.category]}
          </p>
          <h3 className="mt-0.5 font-semibold">{insight.title}</h3>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-slate-50/60 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Calculator className="size-3.5" aria-hidden="true" />
          Calculated from your data
        </p>
        <div className="mt-2">
          <FactTable facts={cited} />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          AI interpretation
        </p>
        <p className="mt-2 text-sm">{insight.interpretation}</p>
        <p className="mt-2 text-sm">
          <span className="font-medium">Recommendation: </span>
          {insight.recommendation}
        </p>
      </div>

      {canDecide && (
        <div className="mt-4 flex flex-wrap gap-2">
          {insight.status === "PENDING" ? (
            <>
              <Button
                className="px-3 py-1.5 text-sm"
                disabled={isDeciding}
                onClick={() => onDecide("APPROVED")}
              >
                <Check className="size-4" aria-hidden="true" />
                Approve
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-sm"
                disabled={isDeciding}
                onClick={() => onDecide("DISMISSED")}
              >
                <X className="size-4" aria-hidden="true" />
                Dismiss
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              disabled={isDeciding}
              onClick={() => onDecide("PENDING")}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {insight.status === "APPROVED" ? "Stop using this" : "Reconsider"}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function ReportBody({
  report,
  canDecide,
  workspaceId,
}: {
  report: InsightReport;
  canDecide: boolean;
  workspaceId: string;
}) {
  const decide = useDecideInsight(workspaceId);
  const [showAllFacts, setShowAllFacts] = useState(false);
  const facts = new Map(report.facts.map((fact) => [fact.id, fact]));
  const byCategory = report.facts.reduce<Partial<Record<InsightCategory, PerformanceFact[]>>>(
    (groups, fact) => ({ ...groups, [fact.category]: [...(groups[fact.category] ?? []), fact] }),
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Week of {formatShortDay(report.weekStart)} · {report.postsAnalyzed} published{" "}
        {report.postsAnalyzed === 1 ? "post" : "posts"} with metrics from the last 90 days · average
        engagement per post {formatCompactNumber(report.baseline.avgEngagement)}
        {report.automatic ? " · weekly run" : " · generated on demand"}
      </p>

      {report.status === "INSUFFICIENT_DATA" && (
        <Alert variant="info" title="Not enough data for AI recommendations yet">
          Recommendations need at least {report.minPostsNeeded} published posts with collected
          metrics. The numbers so far are below; nothing was sent to the AI.
        </Alert>
      )}
      {report.aiError && (
        <Alert variant="warning" title="The numbers are ready, but the AI step failed">
          {report.aiError}
        </Alert>
      )}
      {report.rejectedInsights > 0 && (
        <p className="text-xs text-muted">
          {report.rejectedInsights} AI{" "}
          {report.rejectedInsights === 1 ? "suggestion was" : "suggestions were"} discarded for
          quoting its own numbers or not being backed by enough posts.
        </p>
      )}

      {report.status === "READY" && !report.aiError && report.insights.length === 0 && (
        <p className="text-sm text-muted">
          Nothing stood out strongly enough to recommend this week.
        </p>
      )}

      {report.insights.map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          facts={facts}
          canDecide={canDecide}
          isDeciding={decide.isPending}
          onDecide={(status) =>
            decide.mutate(
              { reportId: report.id, insightId: insight.id, status },
              {
                onSuccess: () =>
                  notify.success(
                    status === "APPROVED"
                      ? "Approved. AI writing will take it into account."
                      : status === "DISMISSED"
                        ? "Insight dismissed."
                        : "No longer used for AI writing.",
                    `insight-${insight.id}`,
                  ),
                onError: (error) => notify.error(error, undefined, `insight-${insight.id}`),
              },
            )
          }
        />
      ))}

      {report.facts.length > 0 && (
        <div>
          <Button
            variant="link"
            aria-expanded={showAllFacts}
            onClick={() => setShowAllFacts((open) => !open)}
          >
            {showAllFacts ? "Hide all calculated results" : "Show all calculated results"}
          </Button>
          {showAllFacts && (
            <div className="mt-3 flex flex-col gap-4">
              {(Object.keys(INSIGHT_CATEGORY_LABELS) as InsightCategory[]).map(
                (category) =>
                  byCategory[category] && (
                    <section key={category}>
                      <h4 className="text-sm font-semibold">{INSIGHT_CATEGORY_LABELS[category]}</h4>
                      <FactTable facts={byCategory[category]} />
                    </section>
                  ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PerformanceInsightsProps {
  workspaceId: string;
  canGenerate: boolean;
  canDecide: boolean;
}

/**
 * Weekly AI recommendations. Calculated numbers and AI interpretation are always
 * shown in separate, labelled blocks so the two can't be confused.
 */
function PerformanceInsights({ workspaceId, canGenerate, canDecide }: PerformanceInsightsProps) {
  const overview = useInsightsOverview(workspaceId);
  const generate = useGenerateInsights(workspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latestId = overview.data?.latest?.id ?? null;
  const viewingId = selectedId && selectedId !== latestId ? selectedId : null;
  const older = useInsightReport(workspaceId, viewingId);
  const report = viewingId ? older.data : overview.data?.latest;
  const reportOptions = (overview.data?.reports ?? []).map((item) => ({
    value: item.id,
    name: `Week of ${formatShortDay(item.weekStart)}${item.automatic ? "" : " (on demand)"}`,
  }));

  return (
    <section
      aria-labelledby="insights-heading"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lightbulb className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="insights-heading" className="font-semibold">
              Weekly AI recommendations
            </h2>
            <p className="text-sm text-muted">
              Figures are calculated from your collected metrics. The AI only interprets them, and
              approved recommendations guide future AI writing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(overview.data?.reports.length ?? 0) > 1 && (
            <Dropdown
              ariaLabel="Choose a report"
              size="sm"
              className="min-w-48"
              options={reportOptions}
              selected={
                reportOptions.find((option) => option.value === (viewingId ?? latestId)) ?? null
              }
              onChange={(option) => setSelectedId(option.value)}
            />
          )}
          {canGenerate && (
            <Button
              variant="secondary"
              isLoading={generate.isPending}
              onClick={() =>
                generate.mutate(undefined, {
                  onSuccess: (created) => {
                    setSelectedId(null);
                    notify.success(
                      created.status === "READY"
                        ? "New report ready."
                        : "Report saved. There isn't enough data for recommendations yet.",
                      "insights-generate",
                    );
                  },
                  onError: (error) => notify.error(error, undefined, "insights-generate"),
                })
              }
            >
              {!generate.isPending && <Sparkles className="size-4" aria-hidden="true" />}
              Generate now
            </Button>
          )}
        </div>
      </div>

      {(overview.data?.approved.length ?? 0) > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50/60 p-3">
          <p className="text-xs font-semibold text-green-800">Currently guiding AI writing</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {overview.data?.approved.map((item) => (
              <li key={item.id}>
                <span className="text-muted">{INSIGHT_CATEGORY_LABELS[item.category]}:</span>{" "}
                {item.recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AsyncContent
        isLoading={overview.isPending || (Boolean(viewingId) && older.isPending)}
        loading={<Skeleton className="h-48 rounded-xl" />}
        error={overview.isError ? overview.error : older.isError ? older.error : undefined}
        errorTitle="We couldn't load recommendations"
        onRetry={() => void (overview.isError ? overview.refetch() : older.refetch())}
        isRetrying={overview.isRefetching || older.isRefetching}
      >
        {report ? (
          <ReportBody report={report} canDecide={canDecide} workspaceId={workspaceId} />
        ) : (
          <p className="text-sm text-muted">
            A report is written each week once your posts have metrics.
            {canGenerate && " You can also generate one now."}
          </p>
        )}
      </AsyncContent>
    </section>
  );
}

export default PerformanceInsights;
