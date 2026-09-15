import type { ComponentProps } from "react";
import { type ButtonVariant, buttonStyles } from "./buttonStyles";
import Spinner from "./Spinner";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

function Button({
  variant = "primary",
  isLoading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonStyles(variant, className)}
      {...props}
    >
      {isLoading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export default Button;
