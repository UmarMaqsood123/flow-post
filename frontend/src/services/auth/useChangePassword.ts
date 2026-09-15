import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./authApi";
import { applySession } from "./sessionCache";

/** The API revokes other sessions and returns a fresh one for this device. */
function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: (session) => applySession(queryClient, session),
  });
}

export default useChangePassword;
