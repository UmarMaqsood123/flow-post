import { Navigate, Outlet } from "react-router";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import { paths } from "./paths";

/** For pages that operate on the current workspace. Sends users without one to create a workspace. */
function RequireWorkspace() {
  const { current, isPending, isError, refetch, isRefetching } = useCurrentWorkspace();

  if (isPending) return <PageLoader label="Loading workspace…" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Alert variant="error" title="We couldn't load your workspaces">
          <Button className="mt-3" onClick={() => refetch()} isLoading={isRefetching}>
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  if (!current) return <Navigate to={paths.createWorkspace} replace />;

  return <Outlet />;
}

export default RequireWorkspace;
