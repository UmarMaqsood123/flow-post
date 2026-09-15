import type { UIMatch } from "react-router";

/** Attach to a route as `handle: { title }` to name the page in the navbar and browser tab. */
export interface RouteHandle {
  title?: string;
}

/** Title of the deepest matched route that defines one. */
export const getRouteTitle = (matches: UIMatch[]): string | undefined => {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const title = (matches[index]?.handle as RouteHandle | undefined)?.title;
    if (title) return title;
  }
  return undefined;
};
