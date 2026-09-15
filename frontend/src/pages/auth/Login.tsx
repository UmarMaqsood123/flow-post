import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import AuthCardHeader from "@/components/shared/AuthCardHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { loginSchema } from "@/schemas/auth.schema";
import useLogin from "@/services/auth/useLogin";

function Login() {
  const login = useLogin();
  // Carries the post-login redirect (e.g. an invitation link) over to the signup page.
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // On success GuestRoute redirects to the dashboard (or the page the user came from).
      await login.mutateAsync(values);
    } catch (error) {
      if (!applyServerFieldErrors(error, setError, ["email", "password"])) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <>
      <AuthCardHeader title="Log in" description="Welcome back to FlowPost." />

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Link
            to={paths.forgotPassword}
            className="self-end text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" isLoading={login.isPending} className="w-full">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          to={paths.signup}
          state={location.state}
          className="font-medium text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </>
  );
}

export default Login;
