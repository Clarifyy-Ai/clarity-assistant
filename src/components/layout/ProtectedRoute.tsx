import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { Spinner } from "@/components/ui/Spinner";

// ─────────────────────────────────────────────────────────────────
// ProtectedRoute
// Redirects unauthenticated users to /login.
// Redirects authenticated users who haven't completed onboarding.
// ─────────────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ requireOnboarding = true }: ProtectedRouteProps) {
  const { user, profile, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireOnboarding && profile && !profile.onboarding_complete) {
    const step = profile.onboarding_step ?? 1;
    return <Navigate to={`/onboarding/step-${step}`} replace />;
  }

  return <Outlet />;
}
