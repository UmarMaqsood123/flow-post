import type { FetchLike } from "../../src/integrations/social/http";

/**
 * A fake Meta Graph API: routes are matched by method and path, and every
 * request is recorded so tests can assert what was sent. No network access.
 */

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: RequestInit["body"];
}

export interface Route {
  method: string;
  match: (url: URL) => boolean;
  respond: (request: RecordedRequest) => Response | Promise<Response>;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/** A Graph API error body, in Meta's shape. */
export const graphError = (
  status: number,
  { message = "Something went wrong", code, subcode, userMessage, type }: GraphErrorOptions,
) =>
  json(status, {
    error: {
      message,
      type: type ?? "OAuthException",
      code,
      error_subcode: subcode,
      error_user_msg: userMessage,
      fbtrace_id: "Atrace",
    },
  });

interface GraphErrorOptions {
  message?: string;
  code?: number;
  subcode?: number;
  userMessage?: string;
  type?: string;
}

export const fakeGraph = (routes: Route[]) => {
  const requests: RecordedRequest[] = [];
  const fetch: FetchLike = async (input, init = {}) => {
    const request: RecordedRequest = {
      url: new URL(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
    };
    requests.push(request);
    const route = routes.find((item) => item.method === request.method && item.match(request.url));
    if (!route) throw new TypeError(`Unexpected request ${request.method} ${input}`);
    return route.respond(request);
  };
  return { fetch, requests };
};

/** Matches a Graph path regardless of the version prefix. */
export const route = (method: string, path: string | RegExp, respond: Route["respond"]): Route => ({
  method,
  match: (url) => {
    const withoutVersion = url.pathname.replace(/^\/v\d+\.\d+/, "");
    return typeof path === "string" ? withoutVersion === path : path.test(withoutVersion);
  },
  respond,
});

export const formBody = (request: RecordedRequest) =>
  Object.fromEntries(new URLSearchParams(String(request.body)));

/** The /me/accounts payload, with a linked Instagram account when asked for. */
export const pagesPayload = (
  pages: {
    id: string;
    name: string;
    token?: string;
    tasks?: string[];
    instagram?: { id: string; username?: string; name?: string };
  }[],
) => ({
  data: pages.map((page) => ({
    id: page.id,
    name: page.name,
    username: `${page.name.toLowerCase().replace(/\s+/g, "")}`,
    category: "Coffee shop",
    access_token: page.token ?? `page-token-${page.id}`,
    tasks: page.tasks ?? ["CREATE_CONTENT", "MANAGE"],
    picture: { data: { url: `https://scontent.test/${page.id}.jpg` } },
    ...(page.instagram
      ? {
          instagram_business_account: {
            id: page.instagram.id,
            username: page.instagram.username ?? "acmecoffee",
            name: page.instagram.name ?? "Acme Coffee",
            profile_picture_url: "https://scontent.test/ig.jpg",
          },
        }
      : {}),
  })),
  paging: {},
});
