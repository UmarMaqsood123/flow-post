import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./authApi";
import { clearSession } from "./sessionCache";

/** Signs out every device, including this one. */
function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: () => clearSession(queryClient),
  });
}

export default useLogoutAll;
