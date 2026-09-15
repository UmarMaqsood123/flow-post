import { Trash2, WandSparkles, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import BriefForm from "@/components/create/BriefForm";
import PostEditor from "@/components/create/PostEditor";
import PostListPane from "@/components/create/PostListPane";
import PostPreview from "@/components/create/PostPreview";
import RefineToolbar from "@/components/create/RefineToolbar";
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
import { platformLabel, POST_STATUS_DETAILS } from "@/config/post";
import { getErrorMessage } from "@/lib/forms";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import {
  useDeletePost,
  useGeneratePosts,
  usePost,
  usePosts,
  useRefinePost,
  useRegeneratePost,
  useRestorePostVersion,
  useSetPostStatus,
  useUpdatePost,
} from "@/services/posts/usePosts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { BrandTone } from "@/types/brandProfile";
import type { GeneratePostsPayload, PostStatus, RefineAction } from "@/types/post";

interface Notice {
  variant: "success" | "error";
  message: string;
  warnings?: string[];
}

const STATUS_OPTIONS = (["DRAFT", "READY", "ARCHIVED"] as PostStatus[]).map((status) => ({
  name: POST_STATUS_DETAILS[status].label,
  value: status,
}));

function AICreatePage() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [pendingAction, setPendingAction] = useState<RefineAction | "REGENERATE" | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const list = usePosts(workspaceId || undefined, { limit: 50 });
  const posts = list.data?.data ?? [];
  const requestedId = searchParams.get("post");
  const selectedId = posts.find((post) => post.id === requestedId)?.id ?? posts[0]?.id;
  const detail = usePost(workspaceId || undefined, selectedId);

  const generate = useGeneratePosts(workspaceId);
  const regenerate = useRegeneratePost(workspaceId);
  const refine = useRefinePost(workspaceId);
  const update = useUpdatePost(workspaceId);
  const restore = useRestorePostVersion(workspaceId);
  const setStatus = useSetPostStatus(workspaceId);
  const remove = useDeletePost(workspaceId);

  const onDirtyChange = useCallback((dirty: boolean) => setHasUnsavedEdits(dirty), []);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;

  const canWrite = hasMinimumRole(current.role, "EDITOR");
  const post = detail.data?.post;
  const versions = detail.data?.versions ?? [];
  const version = post?.currentVersion ?? null;
  const isArchived = post?.status === "ARCHIVED";

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
    setNotice(null);
    generate.mutate(payload, {
      onSuccess: ({ posts: created, warnings }) => {
        setIsBriefOpen(false);
        if (created[0]) selectPost(created[0].id);
        setNotice({
          variant: "success",
          message: `${created.length} ${created.length === 1 ? "post" : "posts"} written. Edit anything, or use the buttons to refine.`,
          warnings,
        });
      },
    });
  };

  const runAction = (
    action: RefineAction | "REGENERATE",
    run: () => Promise<{ warnings: string[] }>,
  ) => {
    if (!post) return;
    setNotice(null);
    setPendingAction(action);
    run()
      .then(({ warnings }) => {
        if (warnings.length > 0) {
          setNotice({ variant: "success", message: "Updated.", warnings });
        }
      })
      .catch((error: unknown) => setNotice({ variant: "error", message: getErrorMessage(error) }))
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
    setNotice(null);
    setRestoringId(versionId);
    restore
      .mutateAsync({ postId: post.id, versionId })
      .catch((error: unknown) => setNotice({ variant: "error", message: getErrorMessage(error) }))
      .finally(() => setRestoringId(null));
  };

  const handleDelete = () => {
    if (!post) return;
    if (!window.confirm(`Delete this ${platformLabel(post.platform)} post and its versions?`)) {
      return;
    }
    remove.mutate(post.id, {
      onSuccess: () => {
        setSearchParams(
          (params) => {
            params.delete("post");
            return params;
          },
          { replace: true },
        );
        setNotice({ variant: "success", message: "Post deleted." });
      },
      onError: (error) => setNotice({ variant: "error", message: getErrorMessage(error) }),
    });
  };

  const isGenerating = generate.isPending;
  const showBrief = isBriefOpen || (posts.length === 0 && canWrite && !list.isPending);

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="AI Create"
        description="One brief, one post per platform — each written for that platform, not copied across."
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

      {notice && (
        <Alert variant={notice.variant}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p>{notice.message}</p>
              {notice.warnings && notice.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {notice.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
              className="rounded-md p-1 opacity-70 hover:opacity-100"
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
            <p>Writing your posts. This usually takes under a minute — keep this page open.</p>
          </div>
        </Alert>
      )}

      {showBrief && (
        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-semibold">What should FlowPost write about?</h2>
          <p className="mt-1 text-sm text-muted">
            Your brand profile and active strategy shape the result.
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
                          setStatus.mutate({ postId: post.id, status: option.value as PostStatus })
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
                    isArchived
                      ? "Archived posts can't be changed. Set the status back to Draft first."
                      : hasUnsavedEdits
                        ? "Save or reset your edits first — an AI change would replace them."
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
                  canEdit={canWrite && !isArchived}
                  onDirtyChange={onDirtyChange}
                  onSave={(content) =>
                    update.mutateAsync({
                      postId: post.id,
                      payload: { baseVersion: post.versionCount, content },
                    })
                  }
                />
                <div className="flex min-w-0 flex-col gap-4">
                  <PostPreview
                    platform={post.platform}
                    content={version.content}
                    workspaceName={current.workspace.name}
                  />
                  <VersionHistory
                    versions={versions}
                    currentVersionId={version.id}
                    canRestore={canWrite && !isArchived}
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
