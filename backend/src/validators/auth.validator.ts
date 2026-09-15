import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailField = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

/** Policy for new passwords. Login accepts any string so policy changes never lock users out. */
const newPasswordField = z
  .string({ error: "Password is required" })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one number");

const existingPasswordField = z
  .string({ error: "Password is required" })
  .min(1, "Password is required")
  .max(PASSWORD_MAX_LENGTH, "Password is too long");

export const tokenField = z
  .string({ error: "Token is required" })
  .trim()
  .min(32, "Invalid token")
  .max(256, "Invalid token")
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid token");

export const registerSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  email: emailField,
  password: newPasswordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: existingPasswordField,
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: tokenField,
  password: newPasswordField,
});

export const verifyEmailSchema = z.object({
  token: tokenField,
});

export const changePasswordSchema = z
  .object({
    currentPassword: existingPasswordField,
    newPassword: newPasswordField,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from your current password",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
