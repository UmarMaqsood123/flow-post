import { useMutation } from "@tanstack/react-query";
import { authApi } from "./authApi";

function useResetPassword() {
  return useMutation({ mutationFn: authApi.resetPassword });
}

export default useResetPassword;
