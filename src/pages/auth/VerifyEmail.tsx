import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { AuthShell } from "@/components/layout/AuthShell";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { getAuthenticatedEntryPath, resolveOnboardingCompletedForRedirect } from "@/lib/auth/postAuthRedirect";
import {
  assignLoginWithReturnTo,
  preferredReturnToFromNavigation,
} from "@/lib/auth/safeReturnTo";
import { authAbsoluteUrl } from "@/lib/auth/appOrigin";
import { formatSupabaseAuthError } from "@/lib/errors";
import {
  classifyEmailOtpError,
  isCompleteEmailOtp,
  normalizeEmailOtpInput,
  type EmailOtpStatus,
} from "@/lib/auth/emailOtp";
import { emailOtpSatisfiesMfa } from "@/lib/auth/securityModel";
import { classifyAuthEmailResend } from "@/lib/auth/signupOutcome";

/**
 * Verify Email gate — shown when an authenticated user has not yet
 * confirmed their email address. Provides:
 *   • clear "verification required" banner (was previously silent)
 *   • resend confirmation link (60s cooldown)
 *   • honest sent / failed / rate-limited states (never fake success)
 *   • sign-out / use-different-account
 *   • automatic redirect once verification completes
 */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const signOut = useAuthStore((s) => s.signOut);
  // Signup has no session yet (email confirmation required), so fall back to
  // the address passed through router state.
  const stateEmail = (location.state as { email?: string } | null)?.email ?? "";
  const email = user?.email ?? stateEmail;
  const preferredReturnTo = useMemo(
    () =>
      preferredReturnToFromNavigation({
        searchParams,
        locationState: location.state,
      }),
    [searchParams, location.state],
  );

  const [resending, setResending] = useState(false);
  const [resendOk, setResendOk] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendRateLimited, setResendRateLimited] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<EmailOtpStatus>("idle");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);

  useEffect(() => {
    if (!isUserEmailConfirmed(user)) return;
    if (otpStatus !== "verified" && otpStatus !== "idle") return;
    const target = getAuthenticatedEntryPath({
      isAdmin,
      isOnboarded: resolveOnboardingCompletedForRedirect({ profile, isProfileLoaded }),
      preferredReturnTo,
    });
    // returnTo is embedded in the onboarding URL by getAuthenticatedEntryPath
    // so a refresh during onboarding still restores the deep-link.
    navigate(target, {
      replace: true,
      state: preferredReturnTo ? { from: preferredReturnTo } : undefined,
    });
  }, [user, isAdmin, profile, isProfileLoaded, navigate, otpStatus, preferredReturnTo]);

  // Refresh auth user after the confirmation link is opened in another tab.
  useEffect(() => {
    if (!email) return;
    const interval = window.setInterval(() => {
      void supabase.auth.getUser().then(({ data }) => {
        if (data.user && isUserEmailConfirmed(data.user)) {
          useAuthStore.getState().setUser(data.user as never);
        }
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [email]);

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
    setResendRateLimited(false);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
            emailRedirectTo: authAbsoluteUrl("/auth/callback"),
      },
    });

    setResending(false);
    if (error) {
      const classified = classifyAuthEmailResend(error);
      setResendOk(false);
      setResendRateLimited(classified.kind === "rate_limited");
      setResendError(
        classified.kind === "rate_limited"
          ? classified.message
          : formatSupabaseAuthError(error) || classified.message,
      );
      setOtpStatus("idle");
      if (classified.kind === "rate_limited") {
        setCooldown(60);
      }
    } else {
      setResendOk(true);
      setResendRateLimited(false);
      setOtpStatus("sent");
      setCooldown(60);
    }
  }

  async function handleVerifyOtp(): Promise<void> {
    if (!email || !isCompleteEmailOtp(otp) || otpBusy) return;
    if (emailOtpSatisfiesMfa()) {
      setOtpError("Email confirmation cannot satisfy two-factor authentication.");
      setOtpStatus("invalid");
      return;
    }
    setOtpBusy(true);
    setOtpError(null);
    setOtpStatus("verifying");
    const token = normalizeEmailOtpInput(otp);
    const attempts: Array<"signup" | "email"> = ["signup", "email"];
    let lastError: unknown = null;
    for (const type of attempts) {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type,
      });
      if (!error && (data.session || data.user)) {
        const confirmed = data.user ?? (await supabase.auth.getUser()).data.user;
        if (confirmed && isUserEmailConfirmed(confirmed)) {
          if (data.session) {
            useAuthStore.getState().setSession(data.session as never);
          } else {
            useAuthStore.getState().setUser(confirmed as never);
          }
          try {
            await useAuthStore.getState().loadProfile({ force: true });
          } catch {
            /* auth listener hydrates new accounts */
          }
          setOtpStatus("verified");
          setOtpBusy(false);
          return;
        }
      }
      lastError = error;
    }
    const classified = classifyEmailOtpError(lastError);
    setOtpStatus(classified.status);
    setOtpError(classified.message);
    setOtpBusy(false);
  }

  async function handleSignOut() {
    await signOut();
    assignLoginWithReturnTo({ returnTo: "/verify-email" });
  }

  return (
    <AuthShell mobileTitle="Verify email">

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
            <div
              data-testid="verify-email-resend-sent"
              className="flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Confirmation email sent. Check your inbox (and spam folder).
            </div>
          )}
          {resendRateLimited && resendError && (
            <div
              data-testid="verify-email-resend-rate-limited"
              role="alert"
              className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {resendError}
            </div>
          )}
          {!resendRateLimited && resendError && (
            <div
              data-testid="verify-email-resend-failed"
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {resendError}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              If the email includes a code, enter it here. This confirms your inbox — it is not two-factor MFA.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(normalizeEmailOtpInput(e.target.value))}
              placeholder="6 or 8 digit code"
              aria-label="Email confirmation code"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            {otpStatus === "sent" && (
              <p className="text-xs text-muted-foreground">Confirmation email sent. Enter the code or open the link.</p>
            )}
            {otpStatus === "verified" && (
              <p className="text-xs text-emerald-600">Email verified.</p>
            )}
            {otpError && (
              <p role="alert" className="text-xs text-destructive">{otpError}</p>
            )}
            <Button
              variant="secondary"
              size="md"
              onClick={() => void handleVerifyOtp()}
              loading={otpBusy}
              disabled={!email || !isCompleteEmailOtp(otp) || otpBusy}
              fullWidth
            >
              Verify code
            </Button>
          </div>

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
    </AuthShell>
  );
}
