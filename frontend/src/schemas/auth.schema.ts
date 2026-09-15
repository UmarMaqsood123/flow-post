import { z } from "zod";

/** Mirrors backend/src/validators/auth.validator.ts so users get instant feedback. */
export const PASSWORD_HINT = "At least 8 characters, including a letter and a number.";

const emailField = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one number");

const passwordsMatch = (
  data: { confirmPassword: string } & Record<string, string>,
  field: string,
) => data[field] === data.confirmPassword;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    email: emailField,
    password: newPasswordField,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => passwordsMatch(data, "password"), {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => passwordsMatch(data, "password"), {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => passwordsMatch(data, "newPassword"), {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from your current password",
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
