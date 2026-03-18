import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────
// Card
// Standard dark glass panel used throughout the app.
// ─────────────────────────────────────────────────────────────────

interface CardProps {
  children:    ReactNode;
  className?:  string;
  padding?:    "none" | "sm" | "md" | "lg";
  hover?:      boolean;
  onClick?:    () => void;
}

const PADDING = {
  none: "",
  sm:   "p-3",
  md:   "p-5",
  lg:   "p-6",
};

export function Card({
  children,
  className,
  padding  = "md",
  hover    = false,
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

// ── CardHeader ────────────────────────────────────────────────────

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

// ── CardTitle ─────────────────────────────────────────────────────

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn("text-sm font-semibold text-white", className)}>
      {children}
    </h3>
  );
}
