import type { Request, Response } from "express";
import { HttpStatus } from "../constants/http.constant";
import { toPublicUser } from "../models/user.model";
import * as AuthService from "../services/auth.service";
import { sendSuccess } from "../utils/apiResponse.util";
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
} from "../utils/cookie.util";
import { getAuthenticatedUser, getRequestMeta } from "../utils/request.util";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "../validators/auth.validator";

/** Refresh token goes in an httpOnly cookie; only the access token is exposed to JavaScript. */
const sendSession = (
  res: Response,
  session: AuthService.AuthSession,
  message: string,
  statusCode: number = HttpStatus.OK,
) => {
  setRefreshTokenCookie(res, session.refreshToken.token, session.refreshToken.expiresAt);
  sendSuccess(res, {
    statusCode,
    message,
    data: { user: session.user, accessToken: session.accessToken, expiresIn: session.expiresIn },
  });
};

export const Register = async (req: Request, res: Response) => {
  const session = await AuthService.registerUser(req.body as RegisterInput, getRequestMeta(req));
  sendSession(
    res,
    session,
    "Account created. Check your email to verify your address.",
    HttpStatus.CREATED,
  );
};

export const Login = async (req: Request, res: Response) => {
  const session = await AuthService.loginUser(req.body as LoginInput, getRequestMeta(req));
  sendSession(res, session, "Logged in successfully");
};

export const Refresh = async (req: Request, res: Response) => {
  try {
    const session = await AuthService.refreshSession(
      getRefreshTokenFromCookie(req),
      getRequestMeta(req),
    );
    sendSession(res, session, "Session refreshed");
  } catch (error) {
    clearRefreshTokenCookie(res);
    throw error;
  }
};

export const Logout = async (req: Request, res: Response) => {
  await AuthService.logoutUser(getRefreshTokenFromCookie(req));
  clearRefreshTokenCookie(res);
  sendSuccess(res, { data: null, message: "Logged out successfully" });
};

export const LogoutAll = async (req: Request, res: Response) => {
  await AuthService.logoutAllSessions(getAuthenticatedUser(req)._id);
  clearRefreshTokenCookie(res);
  sendSuccess(res, { data: null, message: "Logged out of all sessions" });
};

export const GetMe = (req: Request, res: Response) => {
  sendSuccess(res, {
    data: { user: toPublicUser(getAuthenticatedUser(req)) },
    message: "Current user",
  });
};

export const VerifyEmail = async (req: Request, res: Response) => {
  const { token } = req.body as VerifyEmailInput;
  const user = await AuthService.verifyEmail(token);
  sendSuccess(res, { data: { user }, message: "Email verified successfully" });
};

export const ResendVerification = async (req: Request, res: Response) => {
  await AuthService.resendVerificationEmail(getAuthenticatedUser(req));
  sendSuccess(res, { data: null, message: "Verification email sent" });
};

export const ForgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordInput;
  await AuthService.requestPasswordReset(email);
  sendSuccess(res, {
    data: null,
    message: "If an account exists for that email, a password reset link has been sent.",
  });
};

export const ResetPassword = async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body as ResetPasswordInput);
  clearRefreshTokenCookie(res);
  sendSuccess(res, {
    data: null,
    message: "Password reset successfully. Please log in with your new password.",
  });
};

export const ChangePassword = async (req: Request, res: Response) => {
  const session = await AuthService.changePassword(
    getAuthenticatedUser(req),
    req.body as ChangePasswordInput,
    getRequestMeta(req),
  );
  sendSession(res, session, "Password changed. Other sessions have been signed out.");
};
