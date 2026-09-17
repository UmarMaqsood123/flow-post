import { Clock, Heart, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import AsyncContent from "@/components/shared/AsyncContent";
import EmptyState from "@/components/shared/EmptyState";
import PlatformBadge from "@/components/shared/PlatformBadge";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { optionLabel, SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import { formatCompactNumber, formatDateTime, formatRelativeTime } from "@/lib/format";
import type { RecentPost, UpcomingPost } from "@/types/dashboard";
import WidgetCard from "./WidgetCard";

interface PostsWidgetProps {
  title: string;
  description: string;
  icon: LucideIcon;
  variant: "upcoming" | "recent";
  posts?: (UpcomingPost | RecentPost)[];
  isLoading: boolean;
  /** Workspace time zone for scheduled times. */
  timeZone?: string;
  viewAllTo: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}

function Metric({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3.5" aria-hidden="true" />
      {formatCompactNumber(value)}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function PostsWidget({
  title,
  description,
  icon,
  variant,
  posts = [],
  isLoading,
  timeZone,
  viewAllTo,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: PostsWidgetProps) {
  return (
    <WidgetCard
      title={title}
      description={description}
      icon={icon}
      action={
        posts.length > 0 && (
          <Link to={viewAllTo} className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        )
      }
    >
      <AsyncContent
        isLoading={isLoading}
        isEmpty={posts.length === 0}
        loading={
          <ul className="flex flex-col gap-4">
            {[0, 1, 2, 3].map((item) => (
              <li key={item} className="flex gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        }
        empty={
          <EmptyState
            compact
            icon={icon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        }
      >
        <ul className="-my-3 divide-y divide-line">
          {posts.map((post) => (
            <li key={post.id} className="flex gap-3 py-3">
              <PlatformBadge platform={post.platform} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm">{post.topic}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="font-medium text-ink">
                    {optionLabel(SOCIAL_PLATFORM_OPTIONS, post.platform)}
                  </span>
                  {"scheduledAt" in post ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden="true" />
                      <time dateTime={post.scheduledAt}>
                        {formatDateTime(post.scheduledAt, timeZone)}
                      </time>
                    </span>
                  ) : (
                    <>
                      {post.publishedAt && (
                        <time dateTime={post.publishedAt}>
                          {formatRelativeTime(post.publishedAt)}
                        </time>
                      )}
                      {/* Null means no metrics collected yet, which isn't zero engagement. */}
                      {post.engagement === null ? (
                        <span>No metrics yet</span>
                      ) : (
                        <Metric icon={Heart} value={post.engagement} label="engagement" />
                      )}
                    </>
                  )}
                </div>
              </div>
              {variant === "upcoming" && (
                <Badge tone="primary" className="self-start">
                  Scheduled
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </AsyncContent>
    </WidgetCard>
  );
}

export default PostsWidget;
