import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { paths } from "@/routing/paths";

function RouteError() {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Unexpected error";
  const detail = error instanceof Error ? error.message : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {import.meta.env.DEV && detail && <p className="max-w-lg text-sm text-muted">{detail}</p>}
      <Link to={paths.home} className="text-sm font-medium text-primary hover:underline">
        Back to home
      </Link>
    </div>
  );
}

export default RouteError;
