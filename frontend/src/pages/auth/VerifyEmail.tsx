import { useEffect, useRef } from "react";
import { Link } from "react-router";
import AuthCardHeader from "@/components/shared/AuthCardHeader";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/buttonStyles";
import useUrlToken from "@/hooks/useUrlToken";
import { getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import useVerifyEmail from "@/services/auth/useVerifyEmail";

function VerifyEmail() {
  const token = useUrlToken();
  const { data: user } = useSession();
  const { mutate: verifyEmail, isSuccess, isError, error } = useVerifyEmail();
  // Tokens are single-use: guard against StrictMode's double effect run.
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (token && !hasSubmitted.current) {
      hasSubmitted.current = true;
      verifyEmail(token);
    }
  }, [token, verifyEmail]);

  const continueLink = user ? (
    <Link to={paths.dashboard} className={buttonStyles("primary", "mt-6 w-full")}>
      Go to dashboard
    </Link>
  ) : (
    <Link to={paths.login} className={buttonStyles("primary", "mt-6 w-full")}>
      Log in
    </Link>
  );

  if (!token) {
    return (
      <>
        <AuthCardHeader title="Invalid verification link" />
        <Alert variant="error" className="mt-6">
          This link is missing its verification token.
        </Alert>
        {continueLink}
      </>
    );
  }

  if (isSuccess) {
    return (
      <>
        <AuthCardHeader title="Email verified" />
        <Alert variant="success" className="mt-6">
          Thanks! Your email address has been confirmed.
        </Alert>
        {continueLink}
      </>
    );
  }

  if (isError) {
    return (
      <>
        <AuthCardHeader title="Verification failed" />
        <Alert variant="error" className="mt-6">
          {getErrorMessage(error)}
        </Alert>
        <p className="mt-4 text-sm text-muted">
          {user
            ? "You can request a new link from your dashboard."
            : "Log in to request a new verification link."}
        </p>
        {continueLink}
      </>
    );
  }

  return <PageLoader label="Verifying your email…" />;
}

export default VerifyEmail;
