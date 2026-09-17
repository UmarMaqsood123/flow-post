import {
  ArrowRight,
  CheckCheck,
  Clock,
  Hash,
  Lightbulb,
  Link2,
  type LucideIcon,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import type { AiRecommendation, RecommendationKind } from "@/types/dashboard";
import WidgetCard from "./WidgetCard";

const KIND_ICONS: Record<RecommendationKind, LucideIcon> = {
  profile: Store,
  connect: Link2,
  best_time: Clock,
  content_idea: Lightbulb,
  hashtags: Hash,
};

interface AiRecommendationsWidgetProps {
  recommendations?: AiRecommendation[];
  isLoading: boolean;
  className?: string;
}

function AiRecommendationsWidget({
  recommendations = [],
  isLoading,
  className,
}: AiRecommendationsWidgetProps) {
  // Dismissals last for the session; key the widget by workspace to reset them.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = recommendations.filter((item) => !dismissed.includes(item.id));

  return (
    <WidgetCard
      title="AI recommendations"
      description="Suggestions for this week"
      icon={Sparkles}
      className={className}
    >
      <AsyncContent
        isLoading={isLoading}
        isEmpty={visible.length === 0}
        loading={
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24" />
            ))}
          </div>
        }
        empty={
          <EmptyState
            compact
            icon={CheckCheck}
            title="You're all caught up"
            description="New suggestions appear as your content and audience grow."
            action={
              dismissed.length > 0 && (
                <Button
                  variant="secondary"
                  className="px-3 py-1.5"
                  onClick={() => setDismissed([])}
                >
                  Show dismissed
                </Button>
              )
            }
          />
        }
      >
        <ul className="flex flex-col gap-3">
          {visible.map((recommendation) => {
            const Icon = KIND_ICONS[recommendation.kind];
            return (
              <li key={recommendation.id} className="rounded-lg border border-line p-3.5">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{recommendation.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{recommendation.description}</p>
                    <Link
                      to={recommendation.actionTo}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      {recommendation.actionLabel}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                  <button
                    type="button"
                    aria-label={`Dismiss recommendation: ${recommendation.title}`}
                    onClick={() => setDismissed((ids) => [...ids, recommendation.id])}
                    className="-mt-1 -mr-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-ink"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </AsyncContent>
    </WidgetCard>
  );
}

export default AiRecommendationsWidget;
