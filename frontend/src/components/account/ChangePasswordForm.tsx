import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { changePasswordSchema, PASSWORD_HINT } from "@/schemas/auth.schema";
import useChangePassword from "@/services/auth/useChangePassword";
import { notify } from "@/lib/toast";

function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      reset();
      notify.success("Password changed. You've been signed out of all other devices.");
    } catch (error) {
      if (!applyServerFieldErrors(error, setError, ["currentPassword", "newPassword"])) {
        setFormError(getErrorMessage(error));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        error={errors.newPassword?.message}
        {...register("newPassword")}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" isLoading={changePassword.isPending} className="self-start">
        Update password
      </Button>
    </form>
  );
}

export default ChangePasswordForm;
