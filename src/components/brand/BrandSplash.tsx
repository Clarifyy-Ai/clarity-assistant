import { Mail, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/marketing/BrandLogo";
import { Button } from "@/components/ui/Button";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { hardReloadApp, supportMailto } from "@/lib/auth/recoveryActions";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { SPLASH_SUPPORTING } from "@/lib/splash/splashCopy";
import { cn } from "@/lib/utils";

export type BrandSplashProps = {
  statusMessage: string;
  stuck?: boolean;
  offline?: boolean;
  onRetry?: () => void;
  onReload?: () => void;
  loginHref?: string;
  showContinueToWebsite?: boolean;
  variant?: "full" | "inline";
  className?: string;
};

function splashMotion(opts: {
  reducedMotion: boolean;
  offline: boolean;
  stuck: boolean;
}): "full" | "reduced" | "calm" {
  if (opts.reducedMotion) return "reduced";
  if (opts.offline || opts.stuck) return "calm";
  return "full";
}

export function BrandSplash({
  statusMessage,
  stuck = false,
  offline = false,
  onRetry,
  onReload,
  loginHref,
  showContinueToWebsite = false,
  variant = "full",
  className,
}: BrandSplashProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const motion = splashMotion({ reducedMotion, offline, stuck });
  const showActions = stuck || offline;
  const liveRole = stuck || offline ? "alert" : "status";
  const livePoliteness = stuck || offline ? "assertive" : "polite";

  const handleReload = onReload ?? hardReloadApp;

  return (
    <div
      className={cn(
        "brand-splash",
        variant === "inline" && "brand-splash--inline",
        className,
      )}
      data-splash-motion={motion}
      role={liveRole}
      aria-live={livePoliteness}
      aria-busy={!stuck && !offline}
    >
      <div className="brand-splash-ambient" aria-hidden="true">
        <div className="brand-splash-glow" />
        <div className="brand-splash-grid" />
        <div className="brand-splash-wave" />
      </div>

      <div className="brand-splash-content">
        <div className="brand-splash-logo-wrap h-16 w-16">
          <BrandLogo showText={false} size="lg" iconClassName="h-16 w-16" />
          {motion === "full" ? <span className="brand-splash-sweep" /> : null}
        </div>

        <p className="brand-splash-name">
          Career <span className="text-primary">Pilot</span>
        </p>
        <p className="brand-splash-tagline">{PRODUCT_NAMES.tagline}</p>
        <p className="brand-splash-support">{SPLASH_SUPPORTING}</p>

        {stuck ? (
          <h2 className="brand-splash-tagline mt-6">
            This is taking longer than expected
          </h2>
        ) : null}

        {!stuck && !offline ? (
          <div className="brand-splash-bar" aria-hidden="true">
            <span />
          </div>
        ) : null}

        <p className="brand-splash-status">{statusMessage}</p>

        {showActions ? (
          <div className="brand-splash-actions">
            {onRetry ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onRetry}
                leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              >
                Try again
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="md" onClick={handleReload}>
              Reload
            </Button>
            {stuck && loginHref ? (
              <a className="brand-splash-link" href={loginHref}>
                Go to login
              </a>
            ) : null}
            {showContinueToWebsite ? (
              <a className="brand-splash-link" href="/">
                Continue to website
              </a>
            ) : null}
            <a
              className="brand-splash-link"
              href={supportMailto("Career Pilot loading help")}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Contact support
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default BrandSplash;
