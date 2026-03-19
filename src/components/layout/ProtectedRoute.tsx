import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { Spinner } from "@/components/ui/Spinner";

// ─────────────────────────────────────────────────────────────────
// ProtectedRoute
// - Redirects unauthenticated users to /auth/login (with "from" state).
// - Optionally enforces onboarding completion.
// - Optionally enforces admin role.
// ─────────────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
  requireAdmin?: boolean;
  /** Custom login route if your app uses a different path */
  loginPath?: string; // default: "/auth/login"
}

export function ProtectedRoute({
  requireOnboarding = true,
  requireAdmin = false,
  loginPath = "/auth/login",
}: ProtectedRouteProps) {
  const { user, profile, isLoading } = useAuthStore();
  const location = useLocation();

  // 1) Still figuring out session/profile
  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#0a0a0f]"
        role="status"
        aria-live="polite"
      >
        <Spinner size="lg" />
      </div>
    );
  }

  // 2) Not authenticated → redirect to login, preserve "from"
  if (!user) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // 3) Admin-only guard (if required)
  if (requireAdmin) {
    // Adjust this role property to match your profile type:
    // e.g., profile.role, profile.is_admin, or profile?.claims?.role
    const isAdmin =
      (profile as any)?.role === "admin" ||
      (profile as any)?.is_admin === true ||
      (profile as any)?.claims?.role === "admin";

    if (!isAdmin) {
      // Not authorized — send to dashboard or a 403 page
      return <Navigate to="/app/dashboard" replace />;
    }
  }

  // 4) Onboarding guard (if required)
  if (requireOnboarding && profile && !profile.onboarding_completed) {
    const step = profile.onboarding_step ?? 1;
    // Make sure this route exists in your router
    return <Navigate to={`/onboarding/step-${step}`} replace />;
  }

  // 5) All checks passed — render the intended child route
  return <Outlet />;
}
