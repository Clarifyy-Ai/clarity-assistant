import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

// ─────────────────────────────────────────────────────────────────────────────
// AuthCallback
// Handles redirects from OAuth (Google) and magic-link emails.
// Supabase detects the session from the URL automatically (detectSessionInUrl).
// We just wait for the auth store to resolve, then route accordingly.
// ─────────────────────────────────────────────────────────────────────────────

export default function AuthCallback() {
  const navigate = useNavigate();
  const status   = useAuthStore((s) => s.status);
  const isOnboarded = useAuthStore((s) => s.isOnboarded);

  useEffect(() => {
    if (status === "authenticated") {
      navigate(isOnboarded ? "/app/dashboard" : "/onboarding", { replace: true });
    } else if (status === "unauthenticated" || status === "error") {
      navigate("/login?error=auth_failed", { replace: true });
    }
    // "idle" and "loading" — wait
  }, [status, isOnboarded, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent mx-auto" />
        <p className="text-sm text-gray-400">Signing you in…</p>
      </div>
    </div>
  );
}
