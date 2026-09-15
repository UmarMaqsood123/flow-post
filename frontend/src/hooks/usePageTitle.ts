import { useEffect } from "react";
import { useMatches } from "react-router";
import { env } from "@/config/env";
import { getRouteTitle } from "@/routing/routeHandle";

/** Returns the current route's title and mirrors it into the browser tab. */
function usePageTitle(): string | undefined {
  const title = getRouteTitle(useMatches());

  useEffect(() => {
    document.title = title ? `${title} · ${env.appName}` : env.appName;
  }, [title]);

  return title;
}

export default usePageTitle;
