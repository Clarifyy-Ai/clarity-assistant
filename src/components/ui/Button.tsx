import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Button
// Design system primitive — variant + size + loading state.
// ─────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** @deprecated Use `destructive` — `danger` is kept as an alias */
  variant?:  "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "destructive";
  size?:     "xs" | "sm" | "md" | "lg" | "default";
  loading?:  boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS = {
  primary:     "bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground border-transparent shadow-sm hover:shadow-md",
  secondary:   "bg-secondary hover:bg-secondary/80 active:bg-secondary/70 text-secondary-foreground border-border",
  ghost:       "bg-transparent hover:bg-secondary active:bg-secondary/80 text-foreground border-transparent",
  danger:      "bg-destructive/15 hover:bg-destructive/25 active:bg-destructive/30 text-destructive border-destructive/30",
  destructive: "bg-destructive/15 hover:bg-destructive/25 active:bg-destructive/30 text-destructive border-destructive/30",
  success:     "bg-emerald-600/15 hover:bg-emerald-600/25 active:bg-emerald-600/30 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  outline:     "bg-transparent hover:bg-secondary active:bg-secondary/80 text-foreground border-border hover:border-primary/40",
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
      type = "button",
      ...props
    },
    ref
  ) => {
    const resolvedVariant = variant === "danger" ? "destructive" : variant;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium border",
          "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
          "active:scale-[0.98] motion-reduce:active:scale-100",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          VARIANTS[resolvedVariant],
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
