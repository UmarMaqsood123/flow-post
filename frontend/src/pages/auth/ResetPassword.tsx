import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import AuthCardHeader from "@/components/shared/AuthCardHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import TextField from "@/components/ui/TextField";
import useUrlToken from "@/hooks/useUrlToken";
import { ApiError } from "@/lib/apiError";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { PASSWORD_HINT, resetPasswordSchema } from "@/schemas/auth.schema";
import useResetPassword from "@/services/auth/useResetPassword";

function InvalidLink({ message }: { message: string }) {
  return (
    <>
      <AuthCardHeader title="Link expired or invalid" />
      <Alert variant="error" className="mt-6">
        {message}
      </Alert>
      <Link to={paths.forgotPassword} className={buttonStyles("primary", "mt-6 w-full")}>
        Request a new link
      </Link>
    </>
  );
}

function ResetPassword() {
  const token = useUrlToken();
  const resetPassword = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  if (!token) {
    return <InvalidLink message="This password reset link is missing its token." />;
  }
  if (linkError) {
    return <InvalidLink message={linkError} />;
  }

  if (resetPassword.isSuccess) {
    return (
      <>
        <AuthCardHeader title="Password updated" />
        <Alert variant="success" className="mt-6">
          {resetPassword.data}
        </Alert>
        <p className="mt-4 text-sm text-muted">
          For your security, you&apos;ve been signed out of all devices.
        </p>
        <Link to={paths.login} className={buttonStyles("primary", "mt-6 w-full")}>
          Log in
        </Link>
      </>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ token, password });
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_TOKEN") {
        setLinkError(error.message);
        return;
      }
      if (!applyServerFieldErrors(error, setError, ["password"])) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <>
      <AuthCardHeader
        title="Choose a new password"
        description="Make it different from passwords you use elsewhere."
      />

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          label="New password"
          required
          placeholder="Create a new password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          label="Confirm new password"
          required
          placeholder="Re-enter your new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <Button type="submit" isLoading={resetPassword.isPending} className="w-full">
          Reset password
        </Button>
      </form>
    </>
  );
}

export default ResetPassword;
