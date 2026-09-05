import { Navigate } from "react-router-dom";
import { GovExamRouteState } from "@/components/gov-exam/GovExamRouteState";
import {
  useGovExamAuthResolution,
  isGovExamAuthReady,
} from "@/hooks/useGovExamAuthResolution";
import { buildLoginUrl } from "@/lib/auth/safeReturnTo";
import type { GovExamRouteResolution } from "@/lib/gov-exam/routeResolution";

type GovExamPageShellProps = {
  children: React.ReactNode;
  loadResolution?: GovExamRouteResolution | null;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
};

function isBlockingLoadPhase(
  resolution: GovExamRouteResolution,
): boolean {
  return (
    resolution.phase === "TEMPORARY_BACKEND_FAILURE" ||
    resolution.phase === "INVALID_IDENTIFIER" ||
    resolution.phase === "FORBIDDEN_RESOURCE" ||
    resolution.phase === "UNSUPPORTED_EXAM" ||
    resolution.phase === "PLAN_RESTRICTED"
  );
}

export function GovExamPageShell({
  children,
  loadResolution,
  onRetry,
  backHref,
  backLabel,
}: GovExamPageShellProps): React.ReactElement {
  const authResolution = useGovExamAuthResolution();

  if (authResolution.phase === "AUTH_INITIALIZING") {
    return <GovExamRouteState resolution={authResolution} />;
  }

  if (authResolution.phase === "UNAUTHENTICATED") {
    return (
      <Navigate
        to={buildLoginUrl({ returnTo: authResolution.returnTo ?? undefined })}
        replace
      />
    );
  }

  if (authResolution.phase === "EMAIL_VERIFICATION_REQUIRED") {
    return (
      <Navigate
        to={`/auth/verify-email?returnTo=${encodeURIComponent(authResolution.returnTo)}`}
        replace
      />
    );
  }

  if (authResolution.phase === "ONBOARDING_REQUIRED") {
    return (
      <Navigate
        to={`/onboarding?returnTo=${encodeURIComponent(authResolution.returnTo)}`}
        replace
      />
    );
  }

  if (!isGovExamAuthReady(authResolution)) {
    return (
      <GovExamRouteState
        resolution={authResolution}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  if (loadResolution && isBlockingLoadPhase(loadResolution)) {
    return (
      <GovExamRouteState
        resolution={loadResolution}
        onRetry={onRetry}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  return <>{children}</>;
}
