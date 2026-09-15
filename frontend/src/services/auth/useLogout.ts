import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./authApi";
import { clearSession } from "./sessionCache";

function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    // Clear local state even if the request fails (e.g. offline).
    onSettled: () => clearSession(queryClient),
  });
}

export default useLogout;
