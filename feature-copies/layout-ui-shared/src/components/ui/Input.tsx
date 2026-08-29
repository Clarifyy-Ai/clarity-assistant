import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      fullWidth = true,
      className,
      disabled,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    const describedBy = [
      ariaDescribedBy,
      error ? errorId : null,
      hint && !error ? hintId : null,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-muted-foreground"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={ariaInvalid ?? Boolean(error)}
            aria-describedby={describedBy || undefined}
            className={cn(
              "bg-background border text-foreground placeholder:text-muted-foreground rounded-xl",
              "px-4 py-2.5 text-sm w-full",
              "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-150",
              "disabled:cursor-not-allowed disabled:opacity-60",
              error
                ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/30"
                : "border-input",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              className
            )}
            {...props}
          />

          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </span>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            className="text-xs text-red-500 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

// ─────────────────────────────────────────────────────────────────────────────
// Textarea
// ─────────────────────────────────────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      id,
      label,
      error,
      hint,
      className,
      disabled,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    const errorId = `${textareaId}-error`;
    const hintId = `${textareaId}-hint`;

    const describedBy = [
      ariaDescribedBy,
      error ? errorId : null,
      hint && !error ? hintId : null,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-medium text-muted-foreground"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          aria-invalid={ariaInvalid ?? Boolean(error)}
          aria-describedby={describedBy || undefined}
          className={cn(
            "bg-background border text-foreground placeholder:text-muted-foreground rounded-xl",
            "px-4 py-3 text-sm w-full resize-none",
            "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-150",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error
              ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/30"
              : "border-input",
            className
          )}
          {...props}
        />

        {error && (
          <p
            id={errorId}
            className="text-xs text-red-500 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
