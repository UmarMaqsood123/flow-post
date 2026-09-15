import { Navigate, useLocation } from "react-router";

/** Redirects an old URL to its new path, keeping the query string and hash. */
function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export default LegacyRedirect;
