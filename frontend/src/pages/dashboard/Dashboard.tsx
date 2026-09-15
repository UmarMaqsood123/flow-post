import { CalendarClock, Link2, MailPlus, Users } from "lucide-react";
import { Link } from "react-router";
import GettingStarted, { type ChecklistStep } from "@/components/dashboard/GettingStarted";
import StatCard from "@/components/dashboard/StatCard";
import PageHeader from "@/components/shared/PageHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import RoleBadge from "@/components/workspace/RoleBadge";
import WorkspaceAvatar from "@/components/workspace/WorkspaceAvatar";
import { getErrorMessage } from "@/lib/forms";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import useResendVerification from "@/services/auth/useResendVerification";
import useSession from "@/services/auth/useSession";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import useWorkspaceInvitations from "@/services/workspace/useWorkspaceInvitations";
import useWorkspaceMembers from "@/services/workspace/useWorkspaceMembers";
import type { WorkspaceSummary } from "@/types/workspace";

const smallButton = (variant: "primary" | "secondary") => buttonStyles(variant, "px-3 py-1.5");

function CurrentWorkspaceCard({ summary: { workspace, role } }: { summary: WorkspaceSummary }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
      <WorkspaceAvatar name={workspace.name} logo={workspace.logo} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">Current workspace</p>
        <h2 className="truncate text-xl font-semibold">{workspace.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <RoleBadge role={role} />
          {workspace.industry && <span>{workspace.industry}</span>}
          <span>{workspace.timezone.replaceAll("_", " ")}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <Link to={paths.workspaceMembers} className={buttonStyles("secondary")}>
          Team
        </Link>
        <Link to={paths.workspaceSettings} className={buttonStyles("secondary")}>
          Settings
        </Link>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: user } = useSession();
  const resendVerification = useResendVerification();
  const { current, isPending: workspacesPending, isError, error } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id;
  const canManageTeam = current ? hasMinimumRole(current.role, "ADMIN") : false;
  const members = useWorkspaceMembers(workspaceId);
  const invitations = useWorkspaceInvitations(workspaceId, canManageTeam);

  // ProtectedRoute guarantees a user; this narrows the type.
  if (!user) return null;

  const firstName = user.name.split(/\s+/)[0] || user.name;
  const memberCount = members.data?.length;
  const pendingCount = canManageTeam ? invitations.data?.length : undefined;

  const steps: ChecklistStep[] = [
    {
      label: "Verify your email address",
      description: `Confirm ${user.email} so you can accept team invitations.`,
      done: user.emailVerified,
      action: (
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          onClick={() => resendVerification.mutate()}
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
      label: "Invite a teammate",
      description: "Bring in admins, editors or viewers to collaborate.",
      done: (memberCount ?? 0) > 1 || (pendingCount ?? 0) > 0,
      action:
        current && canManageTeam ? (
          <Link to={paths.workspaceMembers} className={smallButton("secondary")}>
            Invite
          </Link>
        ) : undefined,
    },
    {
      label: "Connect your social accounts",
      description: "LinkedIn, Instagram, Facebook, TikTok and YouTube.",
      done: false,
      comingSoon: true,
    },
    {
      label: "Schedule your first post",
      description: "Draft with AI, review and publish on a schedule.",
      done: false,
      comingSoon: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          current ? (
            <>
              Here&apos;s what&apos;s happening in{" "}
              <span className="font-medium text-ink">{current.workspace.name}</span>.
            </>
          ) : (
            "Let's get your first workspace set up."
          )
        }
        actions={
          current ? (
            <Link to={paths.workspaces} className={buttonStyles("secondary")}>
              Manage workspaces
            </Link>
          ) : undefined
        }
      />

      {!user.emailVerified && (
        <Alert variant="warning" title="Verify your email address">
          We sent a verification link to <span className="font-medium">{user.email}</span>. You can
          resend it from the checklist below.
          {resendVerification.isError && (
            <span className="mt-1 block text-red-800">
              {getErrorMessage(resendVerification.error)}
            </span>
          )}
        </Alert>
      )}

      {workspacesPending && (
        <div aria-hidden="true" className="h-28 animate-pulse rounded-xl bg-slate-100" />
      )}
      {isError && <Alert variant="error">{getErrorMessage(error)}</Alert>}
      {!workspacesPending && !isError && current && <CurrentWorkspaceCard summary={current} />}
      {!workspacesPending && !isError && !current && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <h2 className="text-lg font-semibold">Create your first workspace</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Workspaces keep each brand&apos;s posts, team and settings separate. Create one for
            every brand you manage.
          </p>
          <Link to={paths.createWorkspace} className={buttonStyles("primary", "mt-5")}>
            Create workspace
          </Link>
        </div>
      )}

      {current && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Team members"
            value={memberCount ?? "—"}
            icon={Users}
            hint="People with access to this workspace"
            to={paths.workspaceMembers}
          />
          <StatCard
            label="Pending invitations"
            value={canManageTeam ? (pendingCount ?? "—") : "—"}
            icon={MailPlus}
            hint={canManageTeam ? "Waiting to be accepted" : "Visible to admins and owners"}
            to={canManageTeam ? paths.workspaceMembers : undefined}
          />
          <StatCard
            label="Scheduled posts"
            value={0}
            icon={CalendarClock}
            hint="Scheduling is coming soon"
            to={paths.calendar}
          />
          <StatCard
            label="Connected accounts"
            value={0}
            icon={Link2}
            hint="Integrations are coming soon"
          />
        </div>
      )}

      <GettingStarted steps={steps} />
    </div>
  );
}

export default Dashboard;
