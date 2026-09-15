import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { User } from "@/types/auth";
import { authApi } from "./authApi";

function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.verifyEmail,
    // If the verified account is the one signed in here, update it in place.
    onSuccess: (verifiedUser) =>
      queryClient.setQueryData<User | null>(queryKeys.auth.session(), (current) =>
        current && current.id === verifiedUser.id ? verifiedUser : current,
      ),
  });
}

export default useVerifyEmail;
