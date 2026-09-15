import { Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Link } from "react-router";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import { buttonStyles } from "@/components/ui/buttonStyles";
import Skeleton from "@/components/ui/Skeleton";
import { formatCompactNumber, formatShortDay } from "@/lib/format";
import { paths } from "@/routing/paths";
import type { EngagementSummary, MetricWithChange } from "@/types/dashboard";
import WidgetCard from "./WidgetCard";

const SKELETON_BARS = [40, 55, 35, 60, 50, 70, 45, 65, 55, 75, 60, 80, 70, 85];

interface EngagementWidgetProps {
  engagement?: EngagementSummary;
  rate?: MetricWithChange;
  isLoading: boolean;
  className?: string;
}

function EngagementWidget({ engagement, rate, isLoading, className }: EngagementWidgetProps) {
  const daily = engagement?.daily ?? [];
  const total = daily.reduce((sum, day) => sum + day.engagements, 0);
  const max = Math.max(1, ...daily.map((day) => day.engagements));
  const min = Math.min(...daily.map((day) => day.engagements));
  const totals = engagement?.totals;

  return (
    <WidgetCard title="Engagement" description="Last 14 days" icon={Heart} className={className}>
      <AsyncContent
        isLoading={isLoading}
        isEmpty={total === 0}
        loading={
          <div className="flex flex-col gap-5">
            <Skeleton className="h-9 w-32" />
            <div className="flex h-40 items-end gap-1 sm:gap-1.5">
              {SKELETON_BARS.map((height, index) => (
                <Skeleton key={index} className="flex-1" style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-14" />
              ))}
            </div>
          </div>
        }
        empty={
          <EmptyState
            compact
            icon={Heart}
            title="No engagement yet"
            description="Likes, comments and shares appear here once your posts go live."
            action={
              <Link to={paths.socialAccounts} className={buttonStyles("secondary", "px-3 py-1.5")}>
                Connect accounts
              </Link>
            }
          />
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-3xl font-semibold tracking-tight">{formatCompactNumber(total)}</p>
            <p className="text-sm text-muted">
              engagements{rate ? ` · ${rate.value}% engagement rate` : ""}
            </p>
          </div>

          <div>
            <div
              role="img"
              aria-label={`Daily engagements over the last 14 days, between ${min} and ${max} a day.`}
              className="flex h-40 items-end gap-1 sm:gap-1.5"
            >
              {daily.map((day) => (
                <div
                  key={day.date}
                  title={`${formatShortDay(day.date)}: ${day.engagements} engagements`}
                  className="flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
                  style={{ height: `${Math.max(4, (day.engagements / max) * 100)}%` }}
                />
              ))}
            </div>
            {daily.length > 0 && (
              <div aria-hidden="true" className="mt-2 flex justify-between text-xs text-muted">
                <span>{formatShortDay(daily[0]?.date ?? "")}</span>
                <span>{formatShortDay(daily.at(-1)?.date ?? "")}</span>
              </div>
            )}
          </div>

          {totals && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Impressions", value: totals.impressions, icon: Eye },
                { label: "Likes", value: totals.likes, icon: Heart },
                { label: "Comments", value: totals.comments, icon: MessageCircle },
                { label: "Shares", value: totals.shares, icon: Repeat2 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold">{formatCompactNumber(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </AsyncContent>
    </WidgetCard>
  );
}

export default EngagementWidget;
