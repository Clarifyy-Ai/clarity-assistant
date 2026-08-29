import { useCallback } from "react";
import { Home, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { InlineErrorRetry } from "./InlineErrorRetry";

interface NetworkErrorPageProps {
  message?: string;
  onRetry?: () => void;
  homeHref?: string;
  className?: string;
}

/** Full-page offline / network error state with retry and go-home actions. */
export function NetworkErrorPage({
  message = "Unable to reach the server. Check your connection and try again.",
  onRetry,
  homeHref = "/app/dashboard",
  className,
}: NetworkErrorPageProps) {
  const navigate = useNavigate();

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
      return;
    }
    window.location.reload();
  }, [onRetry]);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6 min-h-[60vh] px-6 py-12 text-center",
        className,
      )}
    >
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <WifiOff className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-2 max-w-md">
        <h1 className="text-xl font-semibold text-foreground">Connection problem</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You appear to be offline or the network is unavailable. Live sessions and sync are
          paused until connectivity returns.
        </p>
      </div>

      <InlineErrorRetry
        message={message}
        onRetry={handleRetry}
        className="w-full max-w-md"
      />

      <Button
        variant="outline"
        className="gap-2"
        onClick={() => navigate(homeHref)}
        leftIcon={<Home className="w-4 h-4" aria-hidden="true" />}
      >
        Go home
      </Button>
    </div>
  );
}
