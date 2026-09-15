import { Router } from "express";
import * as AuthController from "../controllers/auth.controller";
import { authenticate, noStore, requireCsrfHeader } from "../middlewares/auth.middleware";
import { authRateLimiters as limit } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validators/auth.validator";

const AuthRouter = Router();

AuthRouter.use(noStore);

// Public
AuthRouter.post(
  "/register",
  limit.register,
  validate({ body: registerSchema }),
  AuthController.Register,
);
AuthRouter.post(
  "/login",
  limit.loginByIp,
  validate({ body: loginSchema }),
  limit.loginByEmail,
  AuthController.Login,
);
AuthRouter.post(
  "/forgot-password",
  limit.forgotPasswordByIp,
  validate({ body: forgotPasswordSchema }),
  limit.forgotPasswordByEmail,
  AuthController.ForgotPassword,
);
AuthRouter.post(
  "/reset-password",
  limit.resetPassword,
  validate({ body: resetPasswordSchema }),
  AuthController.ResetPassword,
);
AuthRouter.post(
  "/verify-email",
  limit.verifyEmail,
  validate({ body: verifyEmailSchema }),
  AuthController.VerifyEmail,
);

// Refresh-cookie authenticated
AuthRouter.post("/refresh", limit.refresh, requireCsrfHeader, AuthController.Refresh);
AuthRouter.post("/logout", requireCsrfHeader, AuthController.Logout);

// Access-token authenticated
AuthRouter.get("/me", authenticate, AuthController.GetMe);
AuthRouter.post("/logout-all", authenticate, AuthController.LogoutAll);
AuthRouter.post(
  "/resend-verification",
  authenticate,
  limit.resendVerification,
  AuthController.ResendVerification,
);
AuthRouter.post(
  "/change-password",
  authenticate,
  limit.changePassword,
  validate({ body: changePasswordSchema }),
  AuthController.ChangePassword,
);

export { AuthRouter };
