import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────
// Card
// Standard dark glass panel used throughout the app.
// ─────────────────────────────────────────────────────────────────

interface CardProps {
  id?: string;
  children?: ReactNode;
  className?: string;
  id?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

interface CardSectionProps {
  children: ReactNode;
  className?: string;
}

const PADDING = {
  none: "",
  sm: "density-card p-[calc(0.75rem*var(--spacing-scale))]",
  md: "density-card p-[calc(1.25rem*var(--spacing-scale))]",
  lg: "density-card p-[calc(1.5rem*var(--spacing-scale))]",
};

export function Card({
  id,
  children,
  className,
  padding = "md",
  hover = false,
  onClick,
}: CardProps) {
  return (
    <div
      id={id}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-2xl shadow-sm",
        PADDING[padding],
        hover && [
          "hover:bg-accent/5 hover:border-accent/20 hover:shadow-md",
          "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
          "active:scale-[0.995] motion-reduce:active:scale-100",
          "cursor-pointer",
        ],
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardSectionProps) {
  return (
    <div className={cn("mb-4 flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: CardSectionProps) {
  return <h3 className={cn("text-sm font-semibold text-foreground", className)}>{children}</h3>;
}

export function CardDescription({ children, className }: CardSectionProps) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function CardContent({ children, className }: CardSectionProps) {
  return <div className={cn(className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardSectionProps) {
  return <div className={cn("mt-4 flex items-center", className)}>{children}</div>;
}
