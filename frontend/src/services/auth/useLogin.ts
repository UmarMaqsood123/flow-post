import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./authApi";
import { applySession } from "./sessionCache";

function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => applySession(queryClient, session),
  });
}

export default useLogin;
