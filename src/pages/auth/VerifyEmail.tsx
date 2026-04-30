import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailCheck, AlertCircle, CheckCircle2, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";

/**
 * Verify Email gate — shown when an authenticated user has not yet
 * confirmed their email address. Provides:
 *   • clear "verification required" banner (was previously silent)
 *   • resend confirmation link (60s cooldown)
 *   • sign-out / use-different-account
 *   • automatic redirect once verification completes
 */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const email = user?.email ?? "";

  const [resending, setResending] = useState(false);
  const [resendOk, setResendOk] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // If the user has already verified (e.g. clicked the link in another tab),
  // bounce them into the app on the next auth event.
  useEffect(() => {
    if (user?.email_confirmed_at) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // Cooldown ticker for the resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleResend() {
    if (!email || resending || cooldown > 0) return;
    setResending(true);
    setResendError(null);
    setResendOk(false);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setResending(false);
    if (error) {
      setResendError(error.message);
    } else {
      setResendOk(true);
      setCooldown(60);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Warning banner — replaces silent redirect */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              Email verification required
            </p>
            <p className="text-muted-foreground mt-0.5">
              You won't be able to access the app until your email address is confirmed.
            </p>
          </div>
        </div>

        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <MailCheck className="w-8 h-8 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
            {email ? (
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                We've sent a confirmation link to{" "}
                <strong className="text-foreground">{email}</strong>. Click the link to
                activate your account.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                We've sent a confirmation link to your email address.
                Click the link to activate your account.
              </p>
            )}
          </div>
        </div>

        {/* Resend feedback */}
        {resendOk && (
          <div className="flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Confirmation email sent. Check your inbox (and spam folder).
          </div>
        )}
        {resendError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {resendError}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleResend}
            loading={resending}
            disabled={!email || cooldown > 0}
            fullWidth
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
          </Button>

          <Button
            variant="ghost"
            size="md"
            onClick={handleSignOut}
            fullWidth
          >
            <LogOut className="w-4 h-4 mr-2" />
            Use a different account
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Didn't receive it? Check your spam folder, or{" "}
          <Link to="/signup" className="text-primary hover:opacity-80 underline">
            sign up again
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
