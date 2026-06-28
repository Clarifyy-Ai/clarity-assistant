import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MailCheck,
  AlertCircle,
  CheckCircle2,
  LogOut,
  RefreshCw,
  Sparkles,
  Shield,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/marketing";

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

  useEffect(() => {
    if (user?.email_confirmed_at) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [user, navigate]);

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
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col relative overflow-hidden bg-gradient-to-br from-primary via-indigo-600 to-blue-700 p-10">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-white blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-white blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" showText={false} />
            <span className="text-xl font-bold text-white">Clarify AI</span>
          </div>

          <div className="flex-1 flex flex-col justify-center mt-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-white text-xs font-medium w-fit mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              One step away from your prep dashboard
            </div>

            <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
              Confirm your
              <br />
              <span className="text-indigo-200">email address</span>
            </h2>

            <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
              We use email verification to keep your account secure and make sure you can recover access if needed.
            </p>

            <div className="space-y-3 mt-10">
              {[
                "Check your inbox for the confirmation link",
                "Click the link to activate your account",
                "Return here — we'll redirect you automatically",
              ].map((step) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-indigo-100 text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-2xl p-5 backdrop-blur-sm">
            <p className="text-white text-sm leading-relaxed">
              Didn&apos;t receive the email? Check your spam folder or use the resend button after the cooldown.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12">
        <div className="lg:hidden mb-8 flex flex-col items-center gap-3 w-full max-w-sm">
          <div className="w-full py-4 bg-gradient-to-r from-primary to-indigo-600 rounded-2xl flex items-center justify-center gap-2">
            <BrandLogo size="sm" showText={false} />
            <span className="text-lg font-bold text-white">Clarify AI</span>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Email verification required
              </p>
              <p className="text-muted-foreground mt-0.5">
                You won&apos;t be able to access the app until your email address is confirmed.
              </p>
            </div>
          </div>

          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto">
              <MailCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
              {email ? (
                <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                  We&apos;ve sent a confirmation link to{" "}
                  <strong className="text-foreground">{email}</strong>. Click the link to
                  activate your account.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                  We&apos;ve sent a confirmation link to your email address.
                  Click the link to activate your account.
                </p>
              )}
            </div>
          </div>

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
            Didn&apos;t receive it? Check your spam folder, or{" "}
            <Link to="/signup" className="text-primary hover:opacity-80 underline">
              sign up again
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
