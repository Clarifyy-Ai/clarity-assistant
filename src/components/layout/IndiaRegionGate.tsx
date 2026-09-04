import { Link } from "react-router-dom";
import { useIndiaRegion } from "@/hooks/useIndiaRegion";
import { Card, CardContent } from "@/components/ui/Card";

interface IndiaRegionGateProps {
  children: React.ReactNode;
  /** @deprecated Silent dashboard redirects removed — kept for call-site compatibility. */
  fallback?: string;
}

/**
 * Gov exam route gate. Access is worldwide by default (`resolveIsIndiaUser`).
 * When forced off in non-prod (`VITE_FORCE_INDIA_REGION=false`), shows an in-page
 * message instead of silently bouncing to the Dashboard (which broke Generate Mock).
 */
export function IndiaRegionGate({ children }: IndiaRegionGateProps) {
  const { isIndia } = useIndiaRegion();
  if (!isIndia) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-6">
            <h1 className="text-lg font-semibold text-foreground">
              Government exams unavailable
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This build has government exam routes disabled for your account
              (region override). Generate Mock and exam sessions stay on this
              page instead of redirecting away.
            </p>
            <Link
              to="/app/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              Back to Dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
