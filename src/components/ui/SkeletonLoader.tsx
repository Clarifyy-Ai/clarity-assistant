import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// SkeletonLoader
// Shimmer placeholder used while async data loads.
// ─────────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  lines?:     number;
  circle?:    boolean;
}

export function Skeleton({ className, circle }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-white/8 rounded-xl",
        circle && "rounded-full",
        className
      )}
    />
  );
}

// ── Preset compositions ───────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton circle className="w-9 h-9 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-2.5 w-full" />
      <Skeleton className="h-2.5 w-4/5" />
      <Skeleton className="h-2.5 w-2/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-white/3 rounded-xl">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/5 ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-2.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
