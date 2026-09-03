import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isElectronApp } from "@/lib/platform/isElectron";
import {
  ELECTRON_DEFAULT_PATH,
  isElectronAllowedPath,
} from "@/lib/platform/electronRoutes";
import { ElectronOpenInBrowser } from "@/components/layout/ElectronOpenInBrowser";
import { CookieConsent } from "@/components/common/CookieConsent";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { AuthDeepLinkGuard } from "@/components/auth/AuthDeepLinkGuard";

/**
 * Restricts the desktop shell to auth, onboarding, and overlay session routes.
 * All other navigation is handled in the system browser.
 */
export function ElectronRouteGate(): JSX.Element {
  const location = useLocation();

  if (!isElectronApp()) {
    return (
      <>
        <ScrollToTop />
        <AuthDeepLinkGuard />
        <Outlet />
        <CookieConsent />
      </>
    );
  }

  const { pathname } = location;

  if (pathname === "/" || pathname === "/dashboard") {
    return <Navigate to={ELECTRON_DEFAULT_PATH} replace />;
  }

  if (isElectronAllowedPath(pathname)) {
    return (
      <>
        <ScrollToTop />
        <AuthDeepLinkGuard />
        <Outlet />
        <CookieConsent />
      </>
    );
  }

  return (
    <ElectronOpenInBrowser
      webPath={`${pathname}${location.search}`}
      autoOpen
    />
  );
}
