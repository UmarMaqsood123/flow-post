import { CalendarClock, ExternalLink, Trash2, WandSparkles, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router";
import BriefForm from "@/components/create/BriefForm";
import PostEditor from "@/components/create/PostEditor";
import PostListPane from "@/components/create/PostListPane";
import PostMediaSection from "@/components/create/PostMediaSection";
import PostPreview from "@/components/create/PostPreview";
import RefineToolbar from "@/components/create/RefineToolbar";
import { DeleteModal } from "@/components/modals";
import SchedulePicker from "@/components/schedule/SchedulePicker";
import VersionHistory from "@/components/create/VersionHistory";
import EmptyState from "@/components/shared/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import PageHeader from "@/components/shared/PageHeader";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import {
  isPostLocked,
  MANUAL_POST_STATUSES,
  platformLabel,
  POST_STATUS_DETAILS,
} from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import { dayKey, formatDayKey, timeKey } from "@/lib/timezone";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import {
  useDeletePost,
  useGeneratePosts,
  usePost,
  usePosts,
  useRefinePost,
  useRegeneratePost,
  useRestorePostVersion,
  useSchedulePost,
  useSetPostStatus,
  useUpdatePost,
} from "@/services/posts/usePosts";
import { useSocialAccounts } from "@/services/socialAccounts/useSocialAccounts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { BrandTone } from "@/types/brandProfile";
import type {
  GeneratePostsPayload,
  ManualPostStatus,
  RefineAction,
  SchedulePostInput,
} from "@/types/post";
import { notify } from "@/lib/toast";

const STATUS_OPTIONS = MANUAL_POST_STATUSES.map((status) => ({
  name: POST_STATUS_DETAILS[status].label,
  value: status,
}));

function AICreatePage() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  /** AI warnings to act on (length limits, buzzwords), kept on screen until dismissed. */
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [pendingAction, setPendingAction] = useState<RefineAction | "REGENERATE" | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const list = usePosts(workspaceId || undefined, { limit: 50 });
  const posts = list.data?.data ?? [];
  const requestedId = searchParams.get("post");
  // A post opened from Content may be older than the recent list, so it's loaded directly.
  const selectedId = requestedId ?? posts[0]?.id;
  const detail = usePost(workspaceId || undefined, selectedId);

  const generate = useGeneratePosts(workspaceId);
  const regenerate = useRegeneratePost(workspaceId);
  const refine = useRefinePost(workspaceId);
  const update = useUpdatePost(workspaceId);
  const restore = useRestorePostVersion(workspaceId);
  const setStatus = useSetPostStatus(workspaceId);
  const remove = useDeletePost(workspaceId);
  const schedulePost = useSchedulePost(workspaceId);
  const socialAccounts = useSocialAccounts(workspaceId || undefined);

  const onDirtyChange = useCallback((dirty: boolean) => setHasUnsavedEdits(dirty), []);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;

  const canWrite = hasMinimumRole(current.role, "EDITOR");
  const post = detail.data?.post;
  const versions = detail.data?.versions ?? [];
  const version = post?.currentVersion ?? null;
  const isLocked = post ? isPostLocked(post.status) : false;

  const selectPost = (postId: string) => {
    setHasUnsavedEdits(false);
    setSearchParams(
      (params) => {
        params.set("post", postId);
        return params;
      },
      { replace: true },
    );
  };

  const handleGenerate = (payload: GeneratePostsPayload) => {
    setWarnings([]);
    generate.mutate(payload, {
      onSuccess: ({ posts: created, warnings }) => {
        setIsBriefOpen(false);
        if (created[0]) selectPost(created[0].id);
        notify.success(
          `${created.length} ${created.length === 1 ? "post" : "posts"} written. Edit anything, or use the buttons to refine.`,
        );
        setWarnings(warnings);
      },
    });
  };

  const runAction = (
    action: RefineAction | "REGENERATE",
    run: () => Promise<{ warnings: string[] }>,
  ) => {
    if (!post) return;
    setWarnings([]);
    setPendingAction(action);
    run()
      .then(({ warnings }) => {
        notify.success("Updated.", "ai-create-action");
        setWarnings(warnings);
      })
      .catch((error: unknown) => notify.error(error, undefined, "ai-create-action"))
      .finally(() => setPendingAction(null));
  };

  const handleRefine = (action: RefineAction, tone?: BrandTone) => {
    if (!post) return;
    runAction(action, () => refine.mutateAsync({ postId: post.id, payload: { action, tone } }));
  };

  const handleRegenerate = () => {
    if (!post) return;
    runAction("REGENERATE", () => regenerate.mutateAsync({ postId: post.id, payload: {} }));
  };

  const handleRestore = (versionId: string) => {
    if (!post) return;
    setWarnings([]);
    setRestoringId(versionId);
    restore
      .mutateAsync({ postId: post.id, versionId })
      .catch((error: unknown) => notify.error(error, undefined, "ai-create-action"))
      .finally(() => setRestoringId(null));
  };

  const handleDelete = () => {
    remove.reset();
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!post) return;
    remove.mutate(post.id, {
      onSuccess: () => {
        setIsDeleteOpen(false);
        setSearchParams(
          (params) => {
            params.delete("post");
            return params;
          },
          { replace: true },
        );
        notify.success("Post deleted.");
      },
    });
  };

  const timeZone = current.workspace.timezone ?? "UTC";
  // Only connected accounts on this post's platform can publish it.
  const accountsForPost = (socialAccounts.data ?? []).filter(
    (account) => account.platform === post?.platform && account.status === "CONNECTED",
  );

  const handleSchedule = (input: SchedulePostInput) => {
    if (!post) return;
    setWarnings([]);
    schedulePost
      .mutateAsync({ postId: post.id, ...input })
      .then((updated) =>
        notify.success(
          `Scheduled for ${formatDayKey(dayKey(new Date(updated.scheduledAt ?? ""), timeZone), { weekday: "short", day: "numeric", month: "short" })} at ${timeKey(new Date(updated.scheduledAt ?? ""), timeZone)}. It publishes automatically.`,
          "ai-create-action",
        ),
      )
      .catch((error: unknown) => notify.error(error, undefined, "ai-create-action"));
  };

  const handleUnschedule = () => {
    if (!post) return;
    setWarnings([]);
    schedulePost
      .mutateAsync({ postId: post.id, scheduledAt: null })
      .then(() => notify.success("Unscheduled.", "ai-create-action"))
      .catch((error: unknown) => notify.error(error, undefined, "ai-create-action"));
  };

  const isGenerating = generate.isPending;
  const showBrief = isBriefOpen || (posts.length === 0 && canWrite && !list.isPending);

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="AI Create"
        description="One brief, one post per platform. Each post is written for its platform, not copied across."
        actions={
          canWrite &&
          !showBrief && (
            <Button onClick={() => setIsBriefOpen(true)} disabled={isGenerating}>
              <WandSparkles className="size-4" aria-hidden="true" />
              New brief
            </Button>
          )
        }
      />

      <DeleteModal
        open={isDeleteOpen && Boolean(post)}
        itemName={post ? `this ${platformLabel(post.platform)} post` : "this post"}
        description={post && `"${post.brief.topic}" and all its versions will be removed.`}
        isDeleting={remove.isPending}
        error={remove.error}
        onConfirm={confirmDelete}
        onClose={() => setIsDeleteOpen(false)}
      />

      {warnings.length > 0 && (
        <Alert variant="warning" title="Check before publishing">
          <div className="flex items-start justify-between gap-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setWarnings([])}
              className="cursor-pointer rounded-md p-1 opacity-70 hover:opacity-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </Alert>
      )}

      {isGenerating && (
        <Alert variant="info">
          <div className="flex items-center gap-3">
            <Spinner className="size-4 shrink-0" />
            <p>Writing your posts. This usually takes under a minute, so keep this page open.</p>
          </div>
        </Alert>
      )}

      {showBrief && (
        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-semibold">What should FlowPost write about?</h2>
          <p className="mt-1 text-sm text-muted">
            Your brand profile, active strategy and approved performance insights shape the result.
          </p>
          <div className="mt-5">
            <BriefForm
              isSubmitting={isGenerating}
              error={generate.error}
              onSubmit={handleGenerate}
              onCancel={posts.length > 0 ? () => setIsBriefOpen(false) : undefined}
            />
          </div>
        </section>
      )}

      {list.isPending ? (
        <div role="status" className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <span className="sr-only">Loading posts…</span>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : list.isError ? (
        <ErrorState
          title="We couldn't load your posts"
          message={getErrorMessage(list.error)}
          onRetry={() => void list.refetch()}
          isRetrying={list.isRefetching}
        />
      ) : posts.length === 0 ? (
        !canWrite && (
          <EmptyState
            icon={WandSparkles}
            title="No posts yet"
            description="An editor, admin or owner can write the first posts from a brief."
          />
        )
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <PostListPane posts={posts} selectedId={selectedId} onSelect={selectPost} />

          {detail.isPending ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : detail.isError || !post || !version ? (
            <ErrorState
              title="We couldn't load this post"
              message={getErrorMessage(detail.error)}
              onRetry={() => void detail.refetch()}
              isRetrying={detail.isRefetching}
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{platformLabel(post.platform)}</h2>
                      <Badge tone={POST_STATUS_DETAILS[post.status].tone}>
                        {POST_STATUS_DETAILS[post.status].label}
                      </Badge>
                      <span className="text-xs text-muted">
                        v{post.versionCount} · {version.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{post.brief.topic}</p>
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Dropdown
                        ariaLabel="Post status"
                        size="sm"
                        className="w-36"
                        options={STATUS_OPTIONS}
                        selected={
                          STATUS_OPTIONS.find((option) => option.value === post.status) ?? null
                        }
                        onChange={(option) =>
                          setStatus.mutate({
                            postId: post.id,
                            status: option.value as ManualPostStatus,
                          })
                        }
                        disabled={setStatus.isPending}
                      />
                      <Button
                        variant="danger"
                        className="px-3 py-1.5 text-sm"
                        onClick={handleDelete}
                        isLoading={remove.isPending}
                      >
                        {!remove.isPending && <Trash2 className="size-4" aria-hidden="true" />}
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </section>

              {canWrite && (
                <RefineToolbar
                  disabledReason={
                    isLocked
                      ? "Published posts can't be changed. Duplicate it from the calendar to work on a new version."
                      : hasUnsavedEdits
                        ? "Save or reset your edits first. An AI change would replace them."
                        : null
                  }
                  pendingAction={pendingAction}
                  onRefine={handleRefine}
                  onRegenerate={handleRegenerate}
                />
              )}

              <div className="grid items-start gap-4 xl:grid-cols-2">
                <PostEditor
                  key={post.id}
                  platform={post.platform}
                  content={version.content}
                  versionId={version.id}
                  canEdit={canWrite && !isLocked}
                  onDirtyChange={onDirtyChange}
                  onSave={(content) =>
                    update.mutateAsync({
                      postId: post.id,
                      payload: { baseVersion: post.versionCount, content },
                    })
                  }
                />
                <div className="flex min-w-0 flex-col gap-4">
                  <PostMediaSection
                    key={`media-${post.id}`}
                    workspaceId={workspaceId}
                    platform={post.platform}
                    media={version.media}
                    videoFormat={version.videoFormat}
                    mediaIssue={version.mediaIssue}
                    canEdit={canWrite}
                    canUpload={canWrite}
                    disabledReason={
                      isLocked
                        ? "Published posts can't be changed."
                        : hasUnsavedEdits
                          ? "Save or reset your edits before changing media."
                          : null
                    }
                    isSaving={update.isPending}
                    error={update.error}
                    onChange={(media, videoFormat) =>
                      update.mutateAsync({
                        postId: post.id,
                        payload: {
                          baseVersion: post.versionCount,
                          content: version.content,
                          media,
                          videoFormat,
                        },
                      })
                    }
                  />
                  <PostPreview
                    platform={post.platform}
                    content={version.content}
                    media={version.media}
                    workspaceName={current.workspace.name}
                  />
                  <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <CalendarClock className="size-4 text-muted" aria-hidden="true" />
                      Schedule
                    </h3>
                    <SchedulePicker
                      key={post.id}
                      post={post}
                      blockedReason={version.mediaIssue}
                      timeZone={timeZone}
                      accounts={accountsForPost}
                      editable={canWrite && !isLocked}
                      busy={schedulePost.isPending}
                      onSchedule={handleSchedule}
                      onUnschedule={handleUnschedule}
                      headless
                    />
                    <Link
                      to={`${paths.calendar}?post=${post.id}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      Open in calendar
                    </Link>
                  </section>
                  <VersionHistory
                    versions={versions}
                    currentVersionId={version.id}
                    canRestore={canWrite && !isLocked}
                    onRestore={handleRestore}
                    restoringId={restoringId}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AICreatePage;
