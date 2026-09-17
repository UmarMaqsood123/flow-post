import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Filter,
  Play,
  Search,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link, useNavigate } from "react-router";
import { DeleteModal } from "@/components/modals";
import EmptyState from "@/components/shared/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import PageHeader from "@/components/shared/PageHeader";
import PlatformBadge from "@/components/shared/PlatformBadge";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import Skeleton from "@/components/ui/Skeleton";
import TextField from "@/components/ui/TextField";
import {
  CREATE_PLATFORM_OPTIONS,
  isPostLocked,
  platformLabel,
  POST_STATUS_DETAILS,
  POST_STATUS_OPTIONS,
} from "@/config/post";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import {
  useContentStrategies,
  useContentStrategy,
} from "@/services/contentStrategy/useContentStrategies";
import { useDeletePost, useDuplicatePost, usePosts } from "@/services/posts/usePosts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { CreatePlatform, Post, PostStatus } from "@/types/post";
import { notify } from "@/lib/toast";

const PAGE_SIZE = 20;

type MediaFilter = "any" | "with" | "without";

const MEDIA_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "with", label: "With media" },
  { value: "without", label: "Without media" },
];

/** The post's first attachment, or its platform when it has none. */
function PostThumbnail({ post }: { post: Post }) {
  const first = post.currentVersion?.media[0];
  if (!first) {
    return (
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-50">
        <PlatformBadge platform={post.platform} />
      </span>
    );
  }
  return (
    <span className="relative block size-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {first.kind === "image" ? (
        <img
          src={first.url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : first.kind === "video" ? (
        <>
          <video
            src={`${first.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            aria-hidden="true"
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Play className="size-4 text-white" aria-hidden="true" />
          </span>
        </>
      ) : (
        <span className="flex size-full items-center justify-center text-primary">
          <FileText className="size-5" aria-hidden="true" />
        </span>
      )}
      {(post.currentVersion?.media.length ?? 0) > 1 && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
          {post.currentVersion?.media.length}
        </span>
      )}
    </span>
  );
}

/** When the post goes out, went out, or that it isn't planned yet. */
function Timing({ post, timeZone }: { post: Post; timeZone: string }) {
  if (post.publishedAt) {
    return <span>Published {formatDateTime(post.publishedAt, timeZone)}</span>;
  }
  if (post.scheduledAt) {
    return <span>{formatDateTime(post.scheduledAt, timeZone)}</span>;
  }
  return <span className="text-muted">Not scheduled</span>;
}

/**
 * Every post in the workspace in one list, whatever state it's in. Writing and
 * editing happen in AI Create; this is where you find a post again.
 */
function Content() {
  const { current } = useCurrentWorkspace();
  const { data: user } = useSession();
  const navigate = useNavigate();
  const workspaceId = current?.workspace.id;
  const timeZone = current?.workspace.timezone ?? "UTC";

  const [search, setSearch] = useState("");
  // Typing shouldn't send a request per keystroke's render.
  const deferredSearch = useDeferredValue(search);
  const [platforms, setPlatforms] = useState<CreatePlatform[]>([]);
  const [statuses, setStatuses] = useState<PostStatus[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [media, setMedia] = useState<MediaFilter>("any");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);

  const posts = usePosts(workspaceId, {
    q: deferredSearch || undefined,
    platform: platforms,
    status: statuses,
    pillar: pillars,
    hasMedia: media === "any" ? undefined : media === "with",
    page,
    limit: PAGE_SIZE,
  });
  const strategies = useContentStrategies(workspaceId);
  const activeStrategyId = strategies.data?.find((item) => item.status === "ACTIVE")?.id;
  const activeStrategy = useContentStrategy(workspaceId, activeStrategyId);
  const duplicate = useDuplicatePost(workspaceId ?? "");
  const remove = useDeletePost(workspaceId ?? "");

  if (!current || !workspaceId) return null;

  const canEdit = hasMinimumRole(current.role, "EDITOR");
  const isAdmin = hasMinimumRole(current.role, "ADMIN");
  const items = posts.data?.data ?? [];
  const pagination = posts.data?.meta?.pagination;
  const pillarOptions =
    activeStrategy.data?.content.contentPillars.map((pillar) => pillar.name) ?? [];
  const activeFilters =
    platforms.length + statuses.length + pillars.length + (media === "any" ? 0 : 1);
  const isFiltered = activeFilters > 0 || deferredSearch.length > 0;

  // Any filter change goes back to the first page, or you'd land on an empty one.
  const filterChange =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const openPost = (post: Post) => navigate(`${paths.aiCreate}?post=${post.id}`);

  const handleDuplicate = (post: Post) => {
    duplicate.mutate(post.id, {
      onSuccess: (copy) => {
        notify.success("Duplicated as a draft.");
        void navigate(`${paths.aiCreate}?post=${copy.id}`);
      },
      onError: (error) => notify.error(error, "We couldn't duplicate that post."),
    });
  };

  const handleDelete = (post: Post) => {
    remove.reset();
    setPostToDelete(post);
  };

  const confirmDelete = () => {
    if (!postToDelete) return;
    remove.mutate(postToDelete.id, {
      onSuccess: () => {
        setPostToDelete(null);
        notify.success("Post deleted.");
      },
    });
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title="Content"
        description="Every post in one place: ideas, drafts, scheduled and published."
        actions={
          canEdit && (
            <Link to={paths.aiCreate} className={buttonStyles("primary")}>
              <WandSparkles className="size-4" aria-hidden="true" />
              Create with AI
            </Link>
          )
        }
      />

      <DeleteModal
        open={postToDelete !== null}
        itemName={postToDelete ? `this ${platformLabel(postToDelete.platform)} post` : "this post"}
        description={
          postToDelete && `"${postToDelete.brief.topic}" and all its versions will be removed.`
        }
        isDeleting={remove.isPending}
        error={remove.error}
        onConfirm={confirmDelete}
        onClose={() => setPostToDelete(null)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted"
            aria-hidden="true"
          />
          <TextField
            label="Search"
            type="search"
            placeholder="Topic or post text"
            value={search}
            onChange={(event) => filterChange(setSearch)(event.target.value)}
            className="[&_input]:pl-9"
          />
        </div>
        <Button
          variant="secondary"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((open) => !open)}
        >
          <Filter className="size-4" aria-hidden="true" />
          Filters
          {activeFilters > 0 && <Badge tone="primary">{activeFilters}</Badge>}
        </Button>
      </div>

      {showFilters && (
        <section
          aria-label="Filters"
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5"
        >
          <ChoiceGroup
            label="Platforms"
            layout="chips"
            multiple
            options={CREATE_PLATFORM_OPTIONS.map(({ value, label }) => ({ value, label }))}
            value={platforms}
            onChange={filterChange(setPlatforms)}
          />
          <ChoiceGroup
            label="Statuses"
            layout="chips"
            multiple
            options={POST_STATUS_OPTIONS}
            value={statuses}
            onChange={filterChange(setStatuses)}
          />
          <ChoiceGroup
            label="Media"
            layout="chips"
            options={MEDIA_OPTIONS}
            value={media}
            onChange={filterChange(setMedia)}
          />
          {pillarOptions.length > 0 && (
            <ChoiceGroup
              label="Content pillars"
              layout="chips"
              multiple
              options={pillarOptions.map((pillar) => ({ value: pillar, label: pillar }))}
              value={pillars}
              onChange={filterChange(setPillars)}
            />
          )}
          {activeFilters > 0 && (
            <Button
              variant="secondary"
              className="self-start px-3 py-1.5 text-sm"
              onClick={() => {
                setPlatforms([]);
                setStatuses([]);
                setPillars([]);
                setMedia("any");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </section>
      )}

      {posts.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : posts.isError ? (
        <ErrorState
          title="We couldn't load your posts"
          message={getErrorMessage(posts.error)}
          onRetry={() => void posts.refetch()}
          isRetrying={posts.isRefetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={isFiltered ? "No posts match" : "No posts yet"}
          description={
            isFiltered
              ? "Try a different search or clear some filters."
              : "Posts you write with AI Create show up here, whatever state they're in."
          }
          action={
            !isFiltered &&
            canEdit && (
              <Link to={paths.aiCreate} className={buttonStyles("primary")}>
                Create with AI
              </Link>
            )
          }
        />
      ) : (
        <ul
          className={cn(
            "flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface transition-opacity",
            posts.isFetching && "opacity-60",
          )}
        >
          {items.map((post) => {
            const status = POST_STATUS_DETAILS[post.status];
            const issue = post.currentVersion?.mediaIssue;
            const preview = post.currentVersion?.content.text.split("\n")[0] ?? "";
            const canDelete = canEdit && (isAdmin || post.createdBy?.id === user?.id);
            return (
              <li key={post.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <button
                  type="button"
                  onClick={() => void openPost(post)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left sm:gap-4"
                  aria-label={`Open ${platformLabel(post.platform)} post: ${post.brief.topic}`}
                >
                  <PostThumbnail post={post} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{post.brief.topic}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {issue && !isPostLocked(post.status) && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-amber-700"
                          title={issue}
                        >
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                          Needs media
                        </span>
                      )}
                    </span>
                    {preview && (
                      <span className="mt-0.5 block truncate text-xs text-muted">{preview}</span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span className="font-medium text-ink">{platformLabel(post.platform)}</span>
                      {post.pillar && <span>{post.pillar}</span>}
                      <Timing post={post} timeZone={timeZone} />
                      <span className="hidden sm:inline">
                        Updated {formatRelativeTime(post.updatedAt)}
                      </span>
                    </span>
                  </span>
                </button>

                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      className="size-8 border-transparent p-0 text-muted"
                      aria-label={`Duplicate ${post.brief.topic}`}
                      title="Duplicate"
                      onClick={() => handleDuplicate(post)}
                      isLoading={duplicate.isPending && duplicate.variables === post.id}
                    >
                      {!(duplicate.isPending && duplicate.variables === post.id) && (
                        <Copy className="size-4" aria-hidden="true" />
                      )}
                    </Button>
                    {canDelete && (
                      <Button
                        variant="secondary"
                        className="size-8 border-transparent p-0 text-muted hover:text-red-700"
                        aria-label={`Delete ${post.brief.topic}`}
                        title="Delete"
                        onClick={() => handleDelete(post)}
                        isLoading={remove.isPending && remove.variables === post.id}
                      >
                        {!(remove.isPending && remove.variables === post.id) && (
                          <Trash2 className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {pagination.total} posts · page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              disabled={!pagination.hasPrevPage || posts.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-sm"
              disabled={!pagination.hasNextPage || posts.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default Content;
