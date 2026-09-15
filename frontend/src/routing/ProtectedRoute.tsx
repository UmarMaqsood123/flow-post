import { Navigate, Outlet, useLocation } from "react-router";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import useSession from "@/services/auth/useSession";
import { paths } from "./paths";

/** Renders child routes only for signed-in users; otherwise redirects to login. */
function ProtectedRoute() {
  const { data: user, isPending, isError, refetch, isRefetching } = useSession();
  const location = useLocation();

  if (isPending) return <PageLoader label="Checking your session…" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Alert variant="error" title="We couldn't reach the server">
          <p>Check your connection and try again.</p>
          <Button className="mt-3" onClick={() => refetch()} isLoading={isRefetching}>
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={paths.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
