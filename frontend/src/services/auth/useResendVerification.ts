import { useMutation } from "@tanstack/react-query";
import { authApi } from "./authApi";

function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification });
}

export default useResendVerification;
