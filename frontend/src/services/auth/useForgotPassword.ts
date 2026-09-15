import { useMutation } from "@tanstack/react-query";
import { authApi } from "./authApi";

function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword });
}

export default useForgotPassword;
