import { useNavigation } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Thin top bar shown while React Router is loading a lazy route module.
 * Gives immediate feedback when the URL changes before page content paints.
 */
export function NavigationProgress(): JSX.Element | null {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5 overflow-hidden transition-opacity duration-150",
        isLoading ? "opacity-100" : "opacity-0",
      )}
      role="progressbar"
      aria-hidden={!isLoading}
      aria-busy={isLoading}
      data-testid="navigation-progress"
    >
      <div className={cn("h-full w-full origin-left bg-primary", isLoading && "animate-pulse")} />
    </div>
  );
}

export default NavigationProgress;
