import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ContactMessagePayload } from "@/types/contact";

/** Public endpoint: works signed in or out, and never triggers a session refresh. */
const sendContactMessage = async (payload: ContactMessagePayload) =>
  (await api.post<null>("/contact", payload, { skipAuthRefresh: true })).message;

function useSendContactMessage() {
  return useMutation({ mutationFn: sendContactMessage });
}

export default useSendContactMessage;
