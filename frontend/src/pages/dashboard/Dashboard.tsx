import { CalendarClock, CalendarPlus, Layers, Plus, Send, WandSparkles } from "lucide-react";
import { Link } from "react-router";
import AiRecommendationsWidget from "@/components/dashboard/AiRecommendationsWidget";
import DashboardStats from "@/components/dashboard/DashboardStats";
import EngagementWidget from "@/components/dashboard/EngagementWidget";
import GettingStarted, { type ChecklistStep } from "@/components/dashboard/GettingStarted";
import PostsWidget from "@/components/dashboard/PostsWidget";
import EmptyState from "@/components/shared/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import PageHeader from "@/components/shared/PageHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { getOnboardingProgress } from "@/lib/brandProfile";
import { getGreeting } from "@/lib/format";
import { getErrorMessage } from "@/lib/forms";
import { buildRecommendations } from "@/lib/recommendations";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import useResendVerification from "@/services/auth/useResendVerification";
import useSession from "@/services/auth/useSession";
import useBrandProfile from "@/services/brandProfile/useBrandProfile";
import { useDashboardSummary } from "@/services/dashboard/useDashboardSummary";
import { useSocialAccounts } from "@/services/socialAccounts/useSocialAccounts";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useWorkspaceInvitations from "@/services/workspace/useWorkspaceInvitations";
import useWorkspaceMembers from "@/services/workspace/useWorkspaceMembers";
import type { AiRecommendation, DashboardSummary } from "@/types/dashboard";
import { notify } from "@/lib/toast";

const smallButton = (variant: "primary" | "secondary") => buttonStyles(variant, "px-3 py-1.5");

interface AnalyticsProps {
  summary?: DashboardSummary;
  isLoading: boolean;
  timeZone?: string;
  /** Resets per-workspace widget state such as dismissed recommendations. */
  workspaceKey: string;
  connectedAccounts?: number;
  recommendations?: AiRecommendation[];
}

function DashboardAnalytics({
  summary,
  isLoading,
  timeZone,
  workspaceKey,
  connectedAccounts,
  recommendations,
}: AnalyticsProps) {
  const stats =
    summary && connectedAccounts !== undefined
      ? { ...summary.stats, connectedAccounts }
      : summary?.stats;
  return (
    <>
      <DashboardStats stats={stats} isLoading={isLoading} />
      {/* items-start: each card keeps its own height instead of stretching to the tallest. */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <EngagementWidget
          className="lg:col-span-2"
          engagement={summary?.engagement}
          availableMetrics={summary?.availableMetrics}
          isLoading={isLoading}
        />
        <AiRecommendationsWidget
          key={workspaceKey}
          recommendations={recommendations}
          isLoading={isLoading}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PostsWidget
          variant="upcoming"
          title="Upcoming posts"
          description="Next in your publishing queue"
          icon={CalendarClock}
          posts={summary?.upcomingPosts}
          isLoading={isLoading}
          timeZone={timeZone}
          viewAllTo={paths.calendar}
          emptyTitle="Nothing scheduled"
          emptyDescription="Schedule posts to keep your channels active while you focus elsewhere."
          emptyAction={
            <Link to={paths.calendar} className={smallButton("secondary")}>
              Schedule a post
            </Link>
          }
        />
        <PostsWidget
          variant="recent"
          title="Recent posts"
          description="Latest published and how they did"
          icon={Send}
          posts={summary?.recentPosts}
          isLoading={isLoading}
          viewAllTo={paths.content}
          emptyTitle="No posts published yet"
          emptyDescription="Published posts and their engagement will show up here."
          emptyAction={
            <Link to={paths.aiCreate} className={smallButton("primary")}>
              Create with AI
            </Link>
          }
        />
      </div>
    </>
  );
}

function Dashboard() {
  const { data: user } = useSession();
  const resendVerification = useResendVerification();
  const workspaces = useCurrentWorkspace();
  const { current } = workspaces;
  const workspace = current?.workspace;
  const isAdmin = current ? hasMinimumRole(current.role, "ADMIN") : false;
  const members = useWorkspaceMembers(workspace?.id);
  const invitations = useWorkspaceInvitations(workspace?.id, isAdmin);
  const brandProfile = useBrandProfile(workspace?.id);
  const socialAccounts = useSocialAccounts(workspace?.id);
  const summary = useDashboardSummary(workspace?.id);

  // ProtectedRoute guarantees a user; this narrows the type.
  if (!user) return null;

  const firstName = user.name.split(/\s+/)[0] || user.name;
  const onboarding = brandProfile.data?.onboarding;
  const progress = brandProfile.data ? getOnboardingProgress(brandProfile.data) : null;

  const steps: ChecklistStep[] = [
    {
      label: "Verify your email address",
      description: `Confirm ${user.email} so you can accept team invitations.`,
      done: user.emailVerified,
      action: (
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          onClick={() =>
            resendVerification.mutate(undefined, {
              onSuccess: () => notify.success(`Verification email sent to ${user.email}.`),
              onError: (error) => notify.error(error),
            })
          }
          isLoading={resendVerification.isPending}
          disabled={resendVerification.isSuccess}
        >
          {resendVerification.isSuccess ? "Email sent" : "Resend email"}
        </Button>
      ),
    },
    {
      label: "Create your first workspace",
      description: "A workspace holds one brand's team, settings and content.",
      done: Boolean(current),
      action: (
        <Link to={paths.createWorkspace} className={smallButton("primary")}>
          Create
        </Link>
      ),
    },
    {
      label: "Set up your brand profile",
      description:
        onboarding?.status === "IN_PROGRESS" && progress
          ? `${progress.done} of ${progress.total} steps done. Pick up where you left off.`
          : "Tell FlowPost about your business, audience, goals and brand voice.",
      done: onboarding?.status === "COMPLETED",
      action: isAdmin ? (
        <Link to={paths.brandProfile} className={smallButton("primary")}>
          {onboarding?.status === "IN_PROGRESS" ? "Continue" : "Start"}
        </Link>
      ) : undefined,
    },
    {
      label: "Invite a teammate",
      description: "Bring in admins, editors or viewers to collaborate.",
      done: (members.data?.length ?? 0) > 1 || (invitations.data?.length ?? 0) > 0,
      action: isAdmin ? (
        <Link to={paths.workspaceMembers} className={smallButton("secondary")}>
          Invite
        </Link>
      ) : undefined,
    },
    {
      label: "Connect your social accounts",
      description: "Start with LinkedIn. More platforms are on the way.",
      done: (socialAccounts.data?.length ?? 0) > 0,
      action: isAdmin ? (
        <Link to={paths.socialAccounts} className={smallButton("secondary")}>
          Connect
        </Link>
      ) : undefined,
    },
  ];
  // Hide the checklist once everything this user can act on is done (and data has loaded).
  const checklistLoaded =
    !current || (!brandProfile.isPending && !members.isPending && !socialAccounts.isPending);
  const showChecklist =
    checklistLoaded &&
    steps.some((step) => !step.comingSoon && !step.done && (step.action || !current));

  const renderBody = () => {
    if (workspaces.isPending) {
      return <DashboardAnalytics isLoading workspaceKey="loading" />;
    }
    if (workspaces.isError) {
      return (
        <ErrorState
          title="We couldn't load your workspaces"
          message={getErrorMessage(workspaces.error)}
          onRetry={() => void workspaces.refetch()}
          isRetrying={workspaces.isRefetching}
        />
      );
    }
    if (!workspace) {
      return (
        <>
          <EmptyState
            icon={Layers}
            title="Create your first workspace"
            description="Workspaces keep each brand's posts, team and settings separate. Create one for every brand you manage."
            action={
              <Link to={paths.createWorkspace} className={buttonStyles("primary")}>
                <Plus className="size-4" aria-hidden="true" />
                Create workspace
              </Link>
            }
          />
          <GettingStarted steps={steps} />
        </>
      );
    }
    return (
      <>
        {showChecklist && <GettingStarted steps={steps} />}
        {summary.isError ? (
          <ErrorState
            title="We couldn't load your dashboard"
            message={getErrorMessage(summary.error)}
            onRetry={() => void summary.refetch()}
            isRetrying={summary.isRefetching}
          />
        ) : (
          <DashboardAnalytics
            summary={summary.data}
            isLoading={summary.isPending}
            timeZone={workspace.timezone}
            workspaceKey={workspace.id}
            connectedAccounts={socialAccounts.data?.length}
            recommendations={buildRecommendations({
              brandProfile: brandProfile.data,
              canEditBrandProfile: isAdmin,
              connectedAccounts: socialAccounts.data?.length ?? 0,
            })}
          />
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${getGreeting()}, ${firstName}`}
        description={
          workspace ? (
            <>
              Here&apos;s what&apos;s happening in{" "}
              <span className="font-medium text-ink">{workspace.name}</span>.
            </>
          ) : (
            "Let's get your first workspace set up."
          )
        }
        actions={
          workspace && (
            <>
              <Link to={paths.calendar} className={buttonStyles("secondary")}>
                <CalendarPlus className="size-4" aria-hidden="true" />
                Schedule post
              </Link>
              <Link to={paths.aiCreate} className={buttonStyles("primary")}>
                <WandSparkles className="size-4" aria-hidden="true" />
                Create with AI
              </Link>
            </>
          )
        }
      />

      {!user.emailVerified && (
        <Alert variant="warning" title="Verify your email address">
          We sent a verification link to <span className="font-medium">{user.email}</span>. You can
          resend it from the checklist below.
        </Alert>
      )}

      {renderBody()}
    </div>
  );
}

export default Dashboard;
