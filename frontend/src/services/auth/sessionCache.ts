import type { QueryClient } from "@tanstack/react-query";
import { clearAccessToken, setAccessToken } from "@/lib/authToken";
import { queryKeys } from "@/lib/queryKeys";
import type { AuthSession } from "@/types/auth";

/** Stores a freshly issued session (login, signup, password change). */
export const applySession = (queryClient: QueryClient, session: AuthSession) => {
  setAccessToken(session.accessToken);
  queryClient.setQueryData(queryKeys.auth.session(), session.user);
};

/** Drops the session and every cached query that may belong to the previous user. */
export const clearSession = (queryClient: QueryClient) => {
  clearAccessToken();
  // Update the session entry in place so mounted route guards observe `null` and redirect.
  // (Calling `queryClient.clear()` would detach those observers from the cache.)
  queryClient.setQueryData(queryKeys.auth.session(), null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== queryKeys.auth.all[0],
  });
};
