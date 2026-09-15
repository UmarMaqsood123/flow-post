import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import AuthCardHeader from "@/components/shared/AuthCardHeader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { forgotPasswordSchema } from "@/schemas/auth.schema";
import useForgotPassword from "@/services/auth/useForgotPassword";

function ForgotPassword() {
  const forgotPassword = useForgotPassword();
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await forgotPassword.mutateAsync(email);
    } catch (error) {
      applyServerFieldErrors(error, setError, ["email"]);
    }
  });

  if (forgotPassword.isSuccess) {
    return (
      <>
        <AuthCardHeader title="Check your email" />
        <Alert variant="success" className="mt-6">
          {forgotPassword.data}
        </Alert>
        <p className="mt-4 text-sm text-muted">
          Sent to <span className="font-medium text-ink">{getValues("email")}</span>. The link
          expires in 1 hour. Didn&apos;t get it? Check your spam folder or{" "}
          <button
            type="button"
            onClick={() => forgotPassword.reset()}
            className="font-medium text-primary hover:underline"
          >
            try again
          </button>
          .
        </p>
        <Link
          to={paths.login}
          className="mt-6 block text-center text-sm font-medium text-primary hover:underline"
        >
          Back to log in
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthCardHeader
        title="Forgot your password?"
        description="Enter your email and we'll send you a link to reset it."
      />

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {forgotPassword.isError && !errors.email && (
          <Alert variant="error">{getErrorMessage(forgotPassword.error)}</Alert>
        )}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />

        <Button type="submit" isLoading={forgotPassword.isPending} className="w-full">
          Send reset link
        </Button>
      </form>

      <Link
        to={paths.login}
        className="mt-6 block text-center text-sm font-medium text-primary hover:underline"
      >
        Back to log in
      </Link>
    </>
  );
}

export default ForgotPassword;
