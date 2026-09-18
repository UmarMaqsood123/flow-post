import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import AuthCardHeader from "@/components/shared/AuthCardHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ApiError } from "@/lib/apiError";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { PASSWORD_HINT, signupSchema } from "@/schemas/auth.schema";
import useRegister from "@/services/auth/useRegister";

function Signup() {
  const registerAccount = useRegister();
  // Carries the post-signup redirect (e.g. an invitation link) over to the login page.
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setFormError(null);
    try {
      // On success GuestRoute redirects to the dashboard, which prompts for email verification.
      await registerAccount.mutateAsync({ name, email, password });
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        setError("email", { type: "server", message: error.message });
        return;
      }
      if (!applyServerFieldErrors(error, setError, ["name", "email", "password"])) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <>
      <AuthCardHeader
        title="Create your account"
        description="Start managing your social media with AI."
      />

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          label="Name"
          required
          placeholder="Jane Smith"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />
        <TextField
          label="Email"
          required
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Password"
          required
          placeholder="Create a password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          label="Confirm password"
          required
          placeholder="Re-enter your password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <Button type="submit" isLoading={registerAccount.isPending} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          to={paths.login}
          state={location.state}
          className="font-medium text-primary hover:underline"
        >
          Log in
        </Link>
      </p>
    </>
  );
}

export default Signup;
