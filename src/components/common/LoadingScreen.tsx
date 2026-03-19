import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export function LoadingScreen({
  message = "Loading...",
  fullScreen = true,
  className,
}: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 bg-background text-foreground",
        fullScreen ? "fixed inset-0 z-50" : "w-full h-full min-h-[200px]",
        className
      )}
    >
      {/* Logo / Brand mark */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          {/* Outer ring pulse */}
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Spinner className="w-6 h-6 text-primary" />
          </div>
        </div>

        {/* Brand name */}
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Clarity
        </span>
      </div>

      {/* Status message */}
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
      )}
    </div>
  );
}
