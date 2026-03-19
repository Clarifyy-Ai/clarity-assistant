import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { AlertCircle } from "lucide-react";

/**
 * ProtectedRoute Component
 * 
 * Guards authenticated routes with multiple layers of protection:
 * 1. Authentication check (must be logged in)
 * 2. Onboarding check (must complete onboarding)
 * 3. Admin role check (if required)
 * 4. Email verification check (if required)
 * 
 * Usage:
 * ```
 * <Route element={<ProtectedRoute />}>
 *   <Route path="/app/admin" element={<AdminDashboard />} />
 * </Route>
 * ```
 */

interface ProtectedRouteProps {
  requireOnboarding?: boolean;
  requireAdmin?: boolean;
  requireEmailVerification?: boolean;
  loginPath?: string;
}

export function ProtectedRoute({
  requireOnboarding = true,
  requireAdmin = false,
  requireEmailVerification = true,
  loginPath = "/auth/login",
}: ProtectedRouteProps) {
  const { user, profile, isLoading, isError, error } = useAuthStore();
  const location = useLocation();

  // ════════════════════════════════════════════════════════════════
  // 1) LOADING STATE
  // ════════════════════════════════════════════════════════════════
  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] to-[#1a1a2e]"
        role="status"
        aria-live="polite"
        aria-label="Loading authentication"
      >
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-gray-400 text-sm">Verifying your session...</p>
        </div>
      </div>
    );
  }

  // ════════════════════════════════��═══════════════════════════════
  // 2) ERROR STATE (Auth fetch failed)
  // ════════════════════════════════════════════════════════════════
  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] to-[#1a1a2e] px-4">
        <Card className="w-full max-w-md p-6 bg-red-950/20 border-red-500/30">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-red-300 mb-2">
                Authentication Error
              </h2>
              <p className="text-sm text-red-200 mb-4">
                {error?.message ||
                  "Failed to verify your authentication. Please try logging in again."}
              </p>
              <a
                href={loginPath}
                className="inline-block px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium text-white transition"
              >
                Return to Login
              </a>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ═══════��════════════════════════════════════════════════════════
  // 3) AUTHENTICATION CHECK
  // ════════════════════════════════════════════════════════════════
  if (!user) {
    return (
      <Navigate
        to={loginPath}
        state={{ from: location }}
        replace
      />
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 4) EMAIL VERIFICATION CHECK
  // ════════════════════════════════════════════════════════════════
  if (requireEmailVerification && !user.email_confirmed_at) {
    return (
      <Navigate
        to="/auth/verify-email"
        state={{ email: user.email, from: location }}
        replace
      />
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 5) ADMIN ROLE CHECK
  // ════════════════════════════════════════════════════════════════
  if (requireAdmin) {
    const isAdmin =
      (profile as any)?.role === "admin" ||
      (profile as any)?.is_admin === true ||
      (profile as any)?.claims?.role === "admin" ||
      user.user_metadata?.role === "admin";

    if (!isAdmin) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] to-[#1a1a2e] px-4">
          <Card className="w-full max-w-md p-6 bg-amber-950/20 border-amber-500/30">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-semibold text-amber-300 mb-2">
                  Access Denied
                </h2>
                <p className="text-sm text-amber-200 mb-4">
                  You don't have admin privileges to access this page.
                </p>
                <a
                  href="/app/dashboard"
                  className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium text-white transition"
                >
                  Go to Dashboard
                </a>
              </div>
            </div>
          </Card>
        </div>
      );
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 6) ONBOARDING CHECK
  // ════════════════════════════════════════════════════════════════
  if (requireOnboarding && profile && !profile.onboarding_completed) {
    const step = profile.onboarding_step ?? 1;
    return (
      <Navigate
        to={`/onboarding/step-${step}`}
        state={{ from: location }}
        replace
      />
    );
  }

  // ════════════════════════════════════════════════════════════════
  // 7) ALL CHECKS PASSED ✅
  // ════════════════════════════════════════════════════════════════
  return <Outlet />;
}

export default ProtectedRoute;
