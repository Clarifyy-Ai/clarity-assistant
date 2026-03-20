import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────
// Card
// Standard dark glass panel used throughout the app.
// ─────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
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
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  children,
  className,
  padding = "md",
  hover = false,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white/5 border border-white/10 rounded-2xl",
        PADDING[padding],
        hover && "hover:bg-white/8 hover:border-white/15 transition-all cursor-pointer",
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
  return <h3 className={cn("text-sm font-semibold text-white", className)}>{children}</h3>;
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
