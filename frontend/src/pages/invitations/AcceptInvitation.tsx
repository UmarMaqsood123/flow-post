import { Link, useNavigate, useSearchParams } from "react-router";
import AuthCardHeader from "@/components/shared/AuthCardHeader";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import WorkspaceAvatar from "@/components/workspace/WorkspaceAvatar";
import { ROLE_LABELS } from "@/config/workspace";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import useLogout from "@/services/auth/useLogout";
import useSession from "@/services/auth/useSession";
import useAcceptInvitation from "@/services/workspace/useAcceptInvitation";
import useInvitationPreview from "@/services/workspace/useInvitationPreview";

function AcceptInvitation() {
  // The token stays in the URL (unlike password reset) so it survives the
  // login/signup redirect when the invitee isn't signed in yet. It's single-use,
  // expires, and only works for the invited, verified email address.
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { data: user } = useSession();
  const preview = useInvitationPreview(token);
  const acceptInvitation = useAcceptInvitation();
  const logout = useLogout();
  const navigate = useNavigate();

  if (!token) {
    return (
      <>
        <AuthCardHeader title="Invalid invitation link" />
        <Alert variant="error" className="mt-6">
          This link is missing its invitation token.
        </Alert>
        <Link to={paths.dashboard} className={buttonStyles("primary", "mt-6 w-full")}>
          Go to dashboard
        </Link>
      </>
    );
  }

  if (preview.isPending) return <PageLoader label="Loading invitation…" />;

  if (preview.isError) {
    return (
      <>
        <AuthCardHeader title="Invitation unavailable" />
        <Alert variant="error" className="mt-6">
          {getErrorMessage(preview.error)}
        </Alert>
        <p className="mt-4 text-sm text-muted">
          Ask a workspace admin to send you a new invitation.
        </p>
        <Link to={paths.dashboard} className={buttonStyles("primary", "mt-6 w-full")}>
          Go to dashboard
        </Link>
      </>
    );
  }

  const invitation = preview.data;
  const needsVerification = invitation.emailMatches && user && !user.emailVerified;
  const canAccept = invitation.emailMatches && Boolean(user?.emailVerified);

  return (
    <div className="flex flex-col">
      <WorkspaceAvatar
        name={invitation.workspace.name}
        logo={invitation.workspace.logo}
        size="lg"
        className="mb-5"
      />
      <AuthCardHeader
        title={`Join ${invitation.workspace.name}`}
        description={
          <>
            {invitation.invitedBy ?? "A teammate"} invited you to join as{" "}
            <span className="font-medium text-ink">{ROLE_LABELS[invitation.role]}</span>.
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-4">
        {!invitation.emailMatches && (
          <Alert variant="warning" title="This invitation is for another account">
            <p>
              It was sent to <span className="font-medium">{invitation.email}</span>, but
              you&apos;re signed in as <span className="font-medium">{user?.email}</span>.
            </p>
            <Button
              variant="link"
              className="mt-2"
              onClick={() => logout.mutate()}
              isLoading={logout.isPending}
            >
              Log out and switch accounts
            </Button>
          </Alert>
        )}

        {needsVerification && (
          <Alert variant="warning" title="Verify your email first">
            Open the verification link we emailed you, then come back to this invitation.
          </Alert>
        )}

        {acceptInvitation.isError && (
          <Alert variant="error">{getErrorMessage(acceptInvitation.error)}</Alert>
        )}

        <Button
          className="w-full"
          disabled={!canAccept}
          isLoading={acceptInvitation.isPending}
          onClick={() =>
            acceptInvitation.mutate(token, { onSuccess: () => navigate(paths.dashboard) })
          }
        >
          Accept invitation
        </Button>
        <p className="text-center text-xs text-muted">
          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export default AcceptInvitation;
