import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

import {
  GoogleOAuthButton,
  GithubOAuthButton,
  LinkedInOAuthButton,
  AzureOAuthButton,
} from "@/components/auth/OAuthButton";

import { formatSupabaseAuthError, isSupabaseConfigAuthError } from "@/lib/errors";
import { loginSchema, type LoginInput } from "@/lib/validators";
import { getCSRFHiddenInputProps, validateCSRFToken } from "@/lib/security";
import { usePageMeta } from "@/hooks/usePageMeta";
import { BrandLogo } from "@/components/marketing";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

const TESTIMONIAL = {
  quote:
    "Clarify AI helped me land offers at 3 FAANG companies. The mock interviews are incredibly realistic.",
  author: "Sarah K.",
  role: "Senior Engineer at Google",
};

const LOCK_KEY = "clarify_login_lock";
const ATTEMPT_KEY = "clarify_login_attempts";
const REMEMBER_ME_KEY = "clarify_remember_me";
/**
 * Client-side UX lockout after failed logins (T-0688).
 * This is NOT authoritative — it can be cleared by wiping localStorage.
 * Real protection: Supabase Auth applies server-side rate limiting on
 * sign-in / token endpoints (dashboard Auth rate limits). Do not invent a
 * separate lockout microservice unless product requires IP-keyed DB locks.
 */
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000;

function safeGetLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function safeRemoveLocalStorageItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function getStoredAttemptCount(): number {
  const raw = safeGetLocalStorageItem(ATTEMPT_KEY);
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function formatLockMessage(lockMinsLeft: number): string {
  return `Too many failed attempts on this device. Try again in ${lockMinsLeft} minute${
    lockMinsLeft === 1 ? "" : "s"
  }. Supabase Auth also rate-limits sign-in on the server.`;
}

export default function Login(): JSX.Element {
  usePageMeta({
    title: "Sign in | Clarify AI",
    description: "Sign in to your Clarify AI account.",
    noIndex: true,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const locationState = location.state as LocationState | null;
  const from = locationState?.from?.pathname ?? "/app";

  const authStatus = useAuthStore((state) => state.status);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isProfileLoaded = useAuthStore((state) => state.isProfileLoaded);
  const signInWithEmail = useAuthStore((state) => state.signInWithEmail);

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => safeGetLocalStorageItem(REMEMBER_ME_KEY) === "true"
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockTick, setLockTick] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    const message = searchParams.get("message");
    const errorCode = searchParams.get("error");
    if (message) {
      setAuthError(decodeURIComponent(message.replace(/\+/g, " ")));
    } else if (errorCode) {
      setAuthError(`Sign-in failed (${errorCode}). Please try again.`);
    } else {
      try {
        const banMessage = sessionStorage.getItem("clarify_auth_ban_message");
        if (banMessage) {
          sessionStorage.removeItem("clarify_auth_ban_message");
          setAuthError(banMessage);
        }
      } catch {
        // Ignore storage failures.
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (mfaPending) return;
    if (authStatus !== "authenticated" || !isProfileLoaded) {
      return;
    }

    const target = isAdmin ? "/app/admin" : from;
    navigate(target, { replace: true });
  }, [authStatus, isProfileLoaded, isAdmin, from, navigate, mfaPending]);

  useEffect(() => {
    const storedLock = safeGetLocalStorageItem(LOCK_KEY);

    if (!storedLock) {
      return;
    }

    const until = Number(storedLock);

    if (Number.isFinite(until) && until > Date.now()) {
      setLockedUntil(until);
      return;
    }

    safeRemoveLocalStorageItem(LOCK_KEY);
    safeRemoveLocalStorageItem(ATTEMPT_KEY);
  }, []);

  useEffect(() => {
    if (!lockedUntil) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        safeRemoveLocalStorageItem(LOCK_KEY);
        safeRemoveLocalStorageItem(ATTEMPT_KEY);
        setAuthError(null);
      } else {
        setLockTick((value) => value + 1);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lockedUntil]);

  const isLocked = Boolean(lockedUntil && lockedUntil > Date.now());

  const lockMinsLeft = useMemo(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) {
      return 0;
    }

    return Math.ceil((lockedUntil - Date.now()) / 60_000);
  }, [lockedUntil, lockTick]);

  const isFormValid = isValid;

  function handleRememberMeChange(checked: boolean): void {
    setRememberMe(checked);

    if (checked) {
      safeSetLocalStorageItem(REMEMBER_ME_KEY, "true");
    } else {
      safeRemoveLocalStorageItem(REMEMBER_ME_KEY);
    }
  }

  async function handleLogin(
    data: LoginInput,
    event?: React.BaseSyntheticEvent
  ): Promise<void> {
    const formEl = event?.target as HTMLFormElement | undefined;
    if (formEl) {
      const formData = new FormData(formEl);
      const token = formData.get("csrfToken");
      if (typeof token !== "string" || !validateCSRFToken(token)) {
        setAuthError("Security token expired. Please refresh and try again.");
        return;
      }
    }

    if (isLocked) {
      setAuthError(formatLockMessage(lockMinsLeft));
      return;
    }

    setAuthError(null);

    try {
      await signInWithEmail(data.email, data.password);

      safeRemoveLocalStorageItem(ATTEMPT_KEY);
      safeRemoveLocalStorageItem(LOCK_KEY);

      // If TOTP MFA is enrolled, require challenge before leaving login.
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const totp = factors?.totp?.find((f) => f.status === "verified");
          if (totp?.id) {
            setMfaFactorId(totp.id);
            setMfaCode("");
            setMfaPending(true);
            return;
          }
        }
      } catch {
        // MFA APIs unavailable — continue as authenticated without challenge.
      }
    } catch (error) {
      const message = formatSupabaseAuthError(error);

      if (isSupabaseConfigAuthError(error)) {
        if (import.meta.env.DEV) {
          console.error("[Login] Supabase client misconfigured:", error);
        }
        setAuthError(message);
        return;
      }

      const previousAttempts = getStoredAttemptCount();
      const nextAttempts = previousAttempts + 1;

      safeSetLocalStorageItem(ATTEMPT_KEY, String(nextAttempts));

      if (nextAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCK_DURATION_MS;

        safeSetLocalStorageItem(LOCK_KEY, String(until));
        setLockedUntil(until);

        setAuthError(
          "Too many failed attempts on this device. Locked for 30 minutes. Supabase Auth also rate-limits sign-in on the server."
        );
        return;
      }

      const remainingAttempts = MAX_ATTEMPTS - nextAttempts;

      if (import.meta.env.DEV) {
        console.error("[Login] signInWithPassword failed:", error);
      }

      setAuthError(
        `${message} (${remainingAttempts} attempt${
          remainingAttempts === 1 ? "" : "s"
        } remaining)`
      );
    }
  }

  async function handleMfaVerify(): Promise<void> {
    if (!mfaFactorId || mfaCode.trim().length < 6) {
      setAuthError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setMfaVerifying(true);
    setAuthError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (verifyError) throw verifyError;
      setMfaPending(false);
      setMfaFactorId(null);
      setMfaCode("");
    } catch (error) {
      setAuthError(formatSupabaseAuthError(error));
    } finally {
      setMfaVerifying(false);
    }
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
              AI-powered interview coaching
            </div>

            <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
              Land your dream
              <br />
              <span className="text-indigo-200">tech role</span>
            </h2>

            <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
              Practice with AI that thinks like a real interviewer. Get instant
              feedback, improve faster.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-10">
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-indigo-200" />
                  <span className="text-white font-black text-2xl">Live</span>
                </div>
                <p className="text-indigo-200 text-xs">
                  AI hints while you practice real interview questions
                </p>
              </div>

              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-indigo-200" />
                  <span className="text-white font-black text-2xl">Prep</span>
                </div>
                <p className="text-indigo-200 text-xs">Mock tests, STAR builder, and answer bank</p>
              </div>
            </div>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-2xl p-5 backdrop-blur-sm">
            <p className="text-white text-sm leading-relaxed italic">
              &quot;{TESTIMONIAL.quote}&quot;
            </p>

            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-400/40 flex items-center justify-center text-white text-xs font-bold">
                {TESTIMONIAL.author[0]}
              </div>

              <div>
                <p className="text-white text-xs font-semibold">
                  {TESTIMONIAL.author}
                </p>
                <p className="text-indigo-200 text-[11px]">
                  {TESTIMONIAL.role}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12">
        <div className="lg:hidden mb-8 flex flex-col items-center gap-3">
          <div className="w-full py-4 bg-gradient-to-r from-primary to-indigo-600 rounded-2xl flex items-center justify-center gap-2">
            <BrandLogo size="sm" showText={false} />
            <span className="text-lg font-bold text-white">Clarify AI</span>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              {mfaPending ? "Two-factor authentication" : "Welcome back"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {mfaPending
                ? "Enter the 6-digit code from your authenticator app"
                : "Sign in to your account to continue"}
            </p>
          </div>

          {mfaPending ? (
            <div className="space-y-4">
              <Input
                label="Authenticator code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                required
              />
              {authError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={mfaVerifying}
                disabled={mfaVerifying || mfaCode.trim().length < 6}
                fullWidth
                onClick={() => void handleMfaVerify()}
              >
                Verify and continue
              </Button>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-2 gap-2">
            <GoogleOAuthButton />
            <GithubOAuthButton />
            <LinkedInOAuthButton />
            <AzureOAuthButton />
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">
              or sign in with email
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form
            className="space-y-4"
            noValidate
            onSubmit={handleSubmit((data, event) => handleLogin(data, event))}
          >
            <input {...getCSRFHiddenInputProps()} />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="space-y-1">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                error={errors.password?.message}
                {...register("password")}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                }
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      handleRememberMeChange(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">
                    Remember me
                  </span>
                </label>

                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:opacity-80 transition-opacity"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {isLocked && (
              <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Temporarily locked on this device</p>
                  <p className="text-xs mt-0.5 opacity-90">
                    Too many failed attempts. Try again in {lockMinsLeft}{" "}
                    minute{lockMinsLeft === 1 ? "" : "s"}, or{" "}
                    <Link to="/forgot-password" className="underline">
                      reset your password
                    </Link>
                    . Server-side Supabase Auth rate limits still apply even
                    if this device lock is cleared.
                  </p>
                </div>
              </div>
            )}

            {authError && !isLocked && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              disabled={isLocked || isSubmitting || !isFormValid}
              fullWidth
            >
              {isLocked ? `Locked (${lockMinsLeft}m)` : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="text-primary font-medium hover:opacity-80 transition-opacity"
            >
              Sign up free
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
