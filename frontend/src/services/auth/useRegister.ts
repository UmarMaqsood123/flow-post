import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./authApi";
import { applySession } from "./sessionCache";

function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (session) => applySession(queryClient, session),
  });
}

export default useRegister;
