import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Button
// Design system primitive — variant + size + loading state.
// ─────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "destructive";
  size?:     "xs" | "sm" | "md" | "lg" | "default";
  loading?:  boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS = {
  primary:     "bg-violet-600 hover:bg-violet-500 text-white border-transparent",
  secondary:   "bg-white/5 hover:bg-white/10 text-gray-200 border-white/10",
  ghost:       "bg-transparent hover:bg-white/5 text-gray-400 hover:text-white border-transparent",
  danger:      "bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-500/30",
  destructive: "bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-500/30",
  success:     "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/30",
  outline:     "bg-transparent hover:bg-white/5 text-gray-300 border-white/15 hover:border-white/25",
};

const SIZES = {
  xs:      "px-2.5 py-1   text-xs  rounded-lg  gap-1.5",
  sm:      "px-3   py-1.5 text-xs  rounded-xl  gap-1.5",
  md:      "px-4   py-2.5 text-sm  rounded-xl  gap-2",
  default: "px-4   py-2.5 text-sm  rounded-xl  gap-2",
  lg:      "px-5   py-3   text-sm  rounded-2xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant   = "secondary",
      size      = "md",
      loading   = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium border transition-all",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50",
          VARIANTS[variant],
          SIZES[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {!loading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

// Compat export for shadcn components that expect buttonVariants
export const buttonVariants = (opts?: { variant?: string; size?: string }) => {
  const v = (opts?.variant ?? "secondary") as keyof typeof VARIANTS;
  const s = (opts?.size ?? "md") as keyof typeof SIZES;
  return cn(
    "inline-flex items-center justify-center font-medium border transition-all",
    VARIANTS[v] ?? VARIANTS.secondary,
    SIZES[s] ?? SIZES.md
  );
};
