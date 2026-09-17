import Badge from "@/components/ui/Badge";
import { platformLabel, POST_STATUS_DETAILS } from "@/config/post";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Post } from "@/types/post";

interface PostListPaneProps {
  posts: Post[];
  selectedId: string | undefined;
  onSelect: (postId: string) => void;
}

function PostListPane({ posts, selectedId, onSelect }: PostListPaneProps) {
  return (
    <nav aria-label="Drafts" className="rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
        Drafts <span className="ml-1 text-muted tabular-nums">{posts.length}</span>
      </h2>
      <ul className="max-h-[32rem] overflow-y-auto lg:max-h-[48rem]">
        {posts.map((post) => {
          const status = POST_STATUS_DETAILS[post.status];
          const isSelected = post.id === selectedId;
          return (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => onSelect(post.id)}
                aria-current={isSelected ? "true" : undefined}
                className={cn(
                  "w-full cursor-pointer border-b border-line px-4 py-3 text-left transition-colors last:border-b-0",
                  isSelected ? "bg-primary/5" : "hover:bg-slate-50",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{platformLabel(post.platform)}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </span>
                <span className="mt-1 block truncate text-sm text-muted">{post.brief.topic}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  v{post.versionCount} · {formatRelativeTime(post.updatedAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default PostListPane;
