import { BrandSplash } from "@/components/brand/BrandSplash";
import { SPLASH_MESSAGES } from "@/lib/splash/splashCopy";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export function LoadingScreen({
  message = SPLASH_MESSAGES.default,
  fullScreen = true,
  className,
}: LoadingScreenProps) {
  return (
    <BrandSplash
      statusMessage={message}
      variant={fullScreen ? "full" : "inline"}
      className={cn(!fullScreen && "min-h-[200px]", className)}
    />
  );
}
