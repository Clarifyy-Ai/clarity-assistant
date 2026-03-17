import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Input + Textarea
// ─────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:      string;
  error?:      string;
  hint?:       string;
  leftIcon?:   ReactNode;
  rightIcon?:  ReactNode;
  fullWidth?:  boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, hint, leftIcon, rightIcon, fullWidth = true, className, ...props },
    ref
  ) => {
    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label className="text-xs font-medium text-gray-300">{label}</label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              "bg-black/30 border text-white placeholder-gray-600 rounded-xl",
              "px-4 py-2.5 text-sm w-full",
              "focus:outline-none focus:border-violet-500 transition-colors",
              error
                ? "border-red-500/60 focus:border-red-500"
                : "border-white/10",
              leftIcon  && "pl-10",
              rightIcon && "pr-10",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

// ── Textarea variant ──────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?:  string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-medium text-gray-300">{label}</label>
        )}
        <textarea
          ref={ref}
          className={cn(
            "bg-black/30 border text-white placeholder-gray-600 rounded-xl",
            "px-4 py-3 text-sm w-full resize-none",
            "focus:outline-none focus:border-violet-500 transition-colors",
            error ? "border-red-500/60" : "border-white/10",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
