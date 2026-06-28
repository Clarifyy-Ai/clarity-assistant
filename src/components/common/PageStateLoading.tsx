import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";

interface PageStateLoadingProps {
  message?: string;
  className?: string;
}

export function PageStateLoading({ message, className }: PageStateLoadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 min-h-[200px]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}

interface PageStateSkeletonProps {
  count?: number;
  className?: string;
}

export function PageStateSkeleton({ count = 3, className }: PageStateSkeletonProps) {
  return (
    <div
      className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}
      aria-busy="true"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
