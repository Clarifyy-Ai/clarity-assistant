/**
 * Auth resolution hook for Government Exam pages.
 * Keeps users on the same URL while auth initializes; never bounces to Dashboard.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  resolveGovExamAuthPhase,
  type GovExamRouteResolution,
} from "@/lib/gov-exam/routeResolution";
import { preferredReturnToFromNavigation } from "@/lib/auth/safeReturnTo";

export function useGovExamAuthResolution(): GovExamRouteResolution {
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);

  return useMemo(() => {
    const returnTo = preferredReturnToFromNavigation({
      searchParams: new URLSearchParams(location.search),
      locationState: location.state,
    });
    return resolveGovExamAuthPhase({
      status,
      hasUser: Boolean(user?.id),
      emailVerified: Boolean(user?.email_confirmed_at),
      onboardingComplete: Boolean(profile?.onboarding_completed),
      profileLoaded: isProfileLoaded,
      mfaBlocked: false,
      returnTo,
    });
  }, [
    status,
    user?.id,
    user?.email_confirmed_at,
    profile?.onboarding_completed,
    isProfileLoaded,
    location,
  ]);
}

export function isGovExamAuthReady(resolution: GovExamRouteResolution): boolean {
  return (
    resolution.phase === "AUTHENTICATED_AND_AUTHORIZED" ||
    resolution.phase.startsWith("VALID_")
  );
}
