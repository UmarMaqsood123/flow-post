import { Outlet } from "react-router";
import PageLoader from "@/components/shared/PageLoader";
import NotFound from "@/pages/NotFound";
import useSession from "@/services/auth/useSession";

/**
 * The admin panel for super admins only. Everyone else sees the ordinary 404,
 * matching the API. This only hides the UI; the API enforces access itself.
 */
function RequireSuperAdmin() {
  const session = useSession();
  if (session.isPending) return <PageLoader label="Loading…" />;
  if (session.data?.role !== "super_admin") return <NotFound />;
  return <Outlet />;
}

export default RequireSuperAdmin;
