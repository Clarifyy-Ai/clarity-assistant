import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BrandSplash } from "@/components/brand/BrandSplash";
import { useIsOffline } from "@/hooks/useIsOffline";
import { buildLoginUrl } from "@/lib/auth/safeReturnTo";
import { hardReloadApp } from "@/lib/auth/recoveryActions";
import { isElectronApp } from "@/lib/platform/isElectron";
import { resolveSplashMessage } from "@/lib/splash/splashCopy";
import { useAuthStore } from "@/store/authStore";

/**
 * Auth / Suspense fallback. Visible only while account bootstrap or a
 * suspended route is in flight. Session/profile budgets live in authStore;
 * this UI surfaces a recoverable stuck state after STUCK_TIMEOUT_MS.
 */
export const STUCK_TIMEOUT_MS = 22_000;

export function AppLoadingFallback(): JSX.Element {
  const [stuck, setStuck] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const location = useLocation();
  const { isOffline } = useIsOffline();
  const hasUser = useAuthStore((state) => Boolean(state.user));
  const isElectron = isElectronApp();

  useEffect(() => {
    setStuck(false);
    const t = window.setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [retryNonce]);

  const handleSoftRetry = useCallback(() => {
    void useAuthStore.getState().retryAccountLoad();
    setRetryNonce((n) => n + 1);
  }, []);

  const statusMessage = resolveSplashMessage({
    pathname: location.pathname,
    isElectron,
    hasUser,
    offline: isOffline,
  });

  const loginHref = buildLoginUrl({
    returnTo: `${location.pathname}${location.search}${location.hash}`,
  });

  return (
    <BrandSplash
      statusMessage={statusMessage}
      stuck={stuck && !isOffline}
      offline={isOffline}
      onRetry={handleSoftRetry}
      onReload={hardReloadApp}
      loginHref={loginHref}
      showContinueToWebsite={!isElectron}
    />
  );
}

export default AppLoadingFallback;
