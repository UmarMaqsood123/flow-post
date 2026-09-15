import { Navigate, Outlet, useLocation } from "react-router";
import PageLoader from "@/components/shared/PageLoader";
import useSession from "@/services/auth/useSession";
import { paths } from "./paths";

/**
 * For login/signup pages: signed-in users are sent on to where they were going.
 * Login and signup rely on this redirect after a successful submit.
 */
function GuestRoute() {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <PageLoader />;

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? paths.dashboard} replace />;
  }

  return <Outlet />;
}

export default GuestRoute;
