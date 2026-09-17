import { useQuery } from "@tanstack/react-query";
import { ApiError, refreshSession } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/authToken";
import { queryKeys } from "@/lib/queryKeys";
import type { User } from "@/types/auth";
import { authApi } from "./authApi";

/**
 * Resolves the signed-in user. On first load there is no access token in
 * memory, so the session is restored from the refresh cookie.
 */
const fetchSessionUser = async (): Promise<User | null> => {
  try {
    if (getAccessToken()) return await authApi.me();
    return (await refreshSession()).user;
  } catch (error) {
    // A suspended account is treated as signed out; the login page explains why.
    if (error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_SUSPENDED")) {
      clearAccessToken();
      return null;
    }
    throw error;
  }
};

/** `data` is the current user, `null` when signed out, `undefined` while loading. */
function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: fetchSessionUser,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export default useSession;
