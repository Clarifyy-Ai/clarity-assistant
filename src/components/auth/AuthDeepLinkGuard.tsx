import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  isPasswordRecoveryFlowMarked,
  resolveAuthDeepLinkRedirect,
} from "@/lib/auth/authDeepLinkRedirect";

/**
 * SPA route guard: when auth tokens land on Site URL (or any wrong path),
 * preserve search/hash and send the user to `/reset-password` or `/auth/callback`.
 */
export function AuthDeepLinkGuard(): null {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const target = resolveAuthDeepLinkRedirect({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      recoveryFlag: isPasswordRecoveryFlowMarked(),
    });
    if (!target) return;

    navigate(target, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
