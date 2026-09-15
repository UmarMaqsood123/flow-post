import { api } from "@/lib/api";
import type { AuthSession, User } from "@/types/auth";

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/** Public auth endpoints must not trigger the refresh-and-retry interceptor. */
const publicRequest = { skipAuthRefresh: true };

export const authApi = {
  register: async (payload: RegisterPayload) =>
    (await api.post<AuthSession>("/auth/register", payload, publicRequest)).data,

  login: async (payload: LoginPayload) =>
    (await api.post<AuthSession>("/auth/login", payload, publicRequest)).data,

  logout: async () => {
    await api.post<null>("/auth/logout", undefined, publicRequest);
  },

  logoutAll: async () => {
    await api.post<null>("/auth/logout-all");
  },

  me: async () => (await api.get<{ user: User }>("/auth/me")).data.user,

  forgotPassword: async (email: string) =>
    (await api.post<null>("/auth/forgot-password", { email }, publicRequest)).message,

  resetPassword: async (payload: ResetPasswordPayload) =>
    (await api.post<null>("/auth/reset-password", payload, publicRequest)).message,

  verifyEmail: async (token: string) =>
    (await api.post<{ user: User }>("/auth/verify-email", { token }, publicRequest)).data.user,

  resendVerification: async () => (await api.post<null>("/auth/resend-verification")).message,

  changePassword: async (payload: ChangePasswordPayload) =>
    (await api.post<AuthSession>("/auth/change-password", payload)).data,
};
