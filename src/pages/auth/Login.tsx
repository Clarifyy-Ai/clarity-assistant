import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";

import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

import { OAuthProviderSection } from "@/components/auth/OAuthProviderSection";
import { OAUTH_NOT_CONFIGURED_MESSAGE } from "@/lib/auth/oauthProviders";

import {
  ACCOUNT_SUSPENDED_MESSAGE,
  isAccountSuspendedAuthError,
  isSupabaseConfigAuthError,
} from "@/lib/errors";
import {
  AUTH_DEVICE_LOCK_MESSAGE,
  classifyLoginFailure,
  loginFailureFromUrl,
} from "@/lib/auth/loginFailure";
import { loginSchema, type LoginInput } from "@/lib/validators";
import { getCSRFHiddenInputProps, validateCSRFToken } from "@/lib/security";
import { usePageMeta } from "@/hooks/usePageMeta";
import { debugLog161d95 } from "@/lib/debug/debugLog161d95";
import { AuthShell } from "@/components/layout/AuthShell";
import { sanitizeReturnTo } from "@/lib/auth/safeReturnTo";
import { isUserEmailConfirmed } from "@/lib/auth/emailVerification";
import { supportMailto } from "@/lib/auth/recoveryActions";
import {
  billingReturnPathForPlan,
  getPendingInterval,
  getPendingPlan,
  isPaidSignupPlan,
  setPendingPlan,
} from "@/lib/billing/pendingPlan";
import {
  consumeAuthEndReason,
  SESSION_EXPIRED_MESSAGE,
  SESSION_EXPIRED_REASON,
  SIGNED_OUT_ELSEWHERE_MESSAGE,
  SIGNED_OUT_ELSEWHERE_REASON,
} from "@/lib/auth/sessionErrors";
import { MFA_ENFORCEMENT_PAUSED, resolveMfaGateFromAal } from "@/lib/auth/mfaGate";
import { verifyTotpChallenge } from "@/lib/auth/mfaFactors";
import {
  MFA_AAL_START_FAILED_MESSAGE,
  MFA_REQUIRED_REASON,
} from "@/hooks/useAuth";

type LocationState = {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
};

const TESTIMONIAL = {
  quote:
    "Career Pilot helped me land offers at 3 FAANG companies. The mock interviews are incredibly realistic.",
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
  }.`;
}

export default function Login(): JSX.Element {
  usePageMeta({
    title: "Sign in | Career Pilot",
    description: "Sign in to your Career Pilot account.",
    noIndex: true,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const locationState = location.state as LocationState | null;
  const returnToFromQuery = sanitizeReturnTo(searchParams.get("returnTo"));
  const returnToFromState = sanitizeReturnTo(
    locationState?.from
      ? `${locationState.from.pathname ?? ""}${locationState.from.search ?? ""}${locationState.from.hash ?? ""}`
      : null,
  );
  const explicitReturnTo = returnToFromQuery ?? returnToFromState;
  const planFromQuery = searchParams.get("plan");
  const intervalFromQuery = searchParams.get("interval");
  const signupHref = isPaidSignupPlan(planFromQuery)
    ? `/signup?plan=${planFromQuery}${
        intervalFromQuery === "yearly" ? "&interval=yearly" : ""
      }`
    : getPendingPlan()
      ? `/signup?plan=${getPendingPlan()}${
          getPendingInterval() === "yearly" ? "&interval=yearly" : ""
        }`
      : "/signup";

  const authStatus = useAuthStore((state) => state.status);
  const authUser = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isProfileLoaded = useAuthStore((state) => state.isProfileLoaded);
  const signInWithEmail = useAuthStore((state) => state.signInWithEmail);
  const storeError = useAuthStore((state) => state.error);

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => safeGetLocalStorageItem(REMEMBER_ME_KEY) === "true"
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockTick, setLockTick] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);
  /** Blocks dashboard redirect until AAL is evaluated (fail-closed MFA). */
  const [mfaGateResolved, setMfaGateResolved] = useState(false);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: { email: "", password: "" },
  });

  function focusFirstInvalidLoginField(fieldErrors: FieldErrors<LoginInput>): void {
    if (fieldErrors.email) {
      setFocus("email");
      return;
    }
    if (fieldErrors.password) {
      setFocus("password");
    }
  }

  useEffect(() => {
    setPendingPlan(searchParams.get("plan"), searchParams.get("interval"));
  }, [searchParams]);

  useEffect(() => {
    const message = searchParams.get("message");
    const errorCode = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const storedReason = consumeAuthEndReason();
    const queryReason =
      searchParams.get("reason") ??
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("reason")
        : null);
    const reason = queryReason ?? storedReason;
    if (reason === SESSION_EXPIRED_REASON) {
      setAuthError(SESSION_EXPIRED_MESSAGE);
    } else if (reason === SIGNED_OUT_ELSEWHERE_REASON) {
      setAuthError(SIGNED_OUT_ELSEWHERE_MESSAGE);
    } else if (reason === MFA_REQUIRED_REASON) {
      setAuthError(MFA_AAL_START_FAILED_MESSAGE);
    } else if (errorCode === "cancelled") {
      setAuthError("Sign-in was cancelled. You can try again whenever you are ready.");
    } else if (errorCode === "not_configured") {
      setAuthError(OAUTH_NOT_CONFIGURED_MESSAGE);
    } else if (errorCode || message || errorDescription) {
      const classified = loginFailureFromUrl({
        error: errorCode,
        errorCode: searchParams.get("error_code"),
        errorDescription,
        message,
      });
      if (classified.code === "AUTH_ACCOUNT_SUSPENDED") {
        setAccountSuspended(true);
      }
      setAuthError(classified.message);
    } else {
      try {
        const banMessage = sessionStorage.getItem("clarify_auth_ban_message");
        if (banMessage) {
          sessionStorage.removeItem("clarify_auth_ban_message");
          setAccountSuspended(true);
          setAuthError(banMessage || ACCOUNT_SUSPENDED_MESSAGE);
        }
      } catch {
        // Ignore storage failures.
      }
    }
  }, [searchParams]);

  async function failClosedMfaStart(): Promise<void> {
    try {
      await useAuthStore.getState().signOut();
    } catch {
      // Local sign-out is best-effort; still block dashboard access.
    }
    setMfaPending(false);
    setMfaFactorId(null);
    setMfaCode("");
    // Keep the redirect gate closed until the auth state reflects sign-out.
    // Otherwise a failed AAL lookup can briefly redirect an aal1 session into
    // the private app before Supabase finishes clearing the session.
    setMfaGateResolved(false);
    setAuthError(MFA_AAL_START_FAILED_MESSAGE);
  }

  // Fail-closed AAL: never continue to the app until MFA is challenged or ruled out.
  useEffect(() => {
    if (authStatus === "idle" || authStatus === "loading") {
      return;
    }
    if (authStatus !== "authenticated" || accountSuspended) {
      setMfaGateResolved(true);
      return;
    }
    if (MFA_ENFORCEMENT_PAUSED) {
      setMfaPending(false);
      setMfaGateResolved(true);
      return;
    }

    let cancelled = false;
    setMfaGateResolved(false);

    void (async () => {
      try {
        const { data: aal, error: aalError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled) return;
        const gate = await resolveMfaGateFromAal({ error: aalError, aal });
        // #region agent log
        debugLog161d95({
          hypothesisId: "H6",
          location: "Login.tsx:mfaGate",
          message: "mfa_login_gate",
          data: {
            decision: gate.decision,
            hasFactorId: Boolean(gate.factorId),
            current: aal?.currentLevel ?? null,
            next: aal?.nextLevel ?? null,
            aalError: aalError
              ? String((aalError as { message?: string }).message ?? aalError).slice(0, 120)
              : null,
          },
        });
        // #endregion
        if (gate.decision === "allow") {
          setMfaGateResolved(true);
          return;
        }
        if (gate.decision === "challenge" && gate.factorId) {
          setMfaFactorId(gate.factorId);
          setMfaCode("");
          setMfaPending(true);
          setAuthError(null);
          setMfaGateResolved(true);
          return;
        }
        await failClosedMfaStart();
      } catch {
        if (!cancelled) {
          await failClosedMfaStart();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, accountSuspended]);

  useEffect(() => {
    if (mfaPending || accountSuspended || !mfaGateResolved) return;
    if (authStatus !== "authenticated" || !isProfileLoaded) {
      return;
    }

    // Unverified email/password sessions must not skip into /app or onboarding.
    if (!isUserEmailConfirmed(authUser)) {
      navigate("/verify-email", { replace: true });
      return;
    }

    const pendingPlan = getPendingPlan();
    const pendingInterval = getPendingInterval();
    // Honor deep-link returnTo when present; else paid-plan CTAs → billing; else admin/dashboard.
    const target =
      explicitReturnTo ??
      (pendingPlan
        ? billingReturnPathForPlan(pendingPlan, pendingInterval)
        : isAdmin
          ? "/app/admin"
          : "/app/dashboard");
    navigate(target, { replace: true });
  }, [
    authStatus,
    isProfileLoaded,
    isAdmin,
    explicitReturnTo,
    navigate,
    mfaPending,
    accountSuspended,
    authUser,
    mfaGateResolved,
  ]);

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

  const displayedError = authError ?? storeError;

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
    setAccountSuspended(false);
    setMfaGateResolved(false);

    try {
      await signInWithEmail(data.email, data.password);

      safeRemoveLocalStorageItem(ATTEMPT_KEY);
      safeRemoveLocalStorageItem(LOCK_KEY);
      // AAL is enforced by the authenticated-session effect (fail-closed).
      // Do not continue to the dashboard from this handler.
    } catch (error) {
      setMfaGateResolved(true);
      const classified = classifyLoginFailure(error);

      if (classified.code === "AUTH_ACCOUNT_SUSPENDED" || isAccountSuspendedAuthError(error)) {
        setAccountSuspended(true);
        setAuthError(ACCOUNT_SUSPENDED_MESSAGE);
        return;
      }

      if (classified.code === "AUTH_EMAIL_NOT_VERIFIED") {
        navigate("/verify-email", {
          replace: true,
          state: { email: data.email.trim().toLowerCase() },
        });
        return;
      }

      if (classified.code === "AUTH_CONFIG" || isSupabaseConfigAuthError(error)) {
        if (import.meta.env.DEV) {
          console.error("[Login] Sign-in client misconfigured:", error);
        }
        setAuthError(classified.message);
        return;
      }

      if (classified.code !== "AUTH_INVALID_CREDENTIALS") {
        setAuthError(classified.message);
        return;
      }

      const previousAttempts = getStoredAttemptCount();
      const nextAttempts = previousAttempts + 1;

      safeSetLocalStorageItem(ATTEMPT_KEY, String(nextAttempts));

      if (nextAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCK_DURATION_MS;

        safeSetLocalStorageItem(LOCK_KEY, String(until));
        setLockedUntil(until);

        setAuthError(AUTH_DEVICE_LOCK_MESSAGE);
        return;
      }

      const remainingAttempts = MAX_ATTEMPTS - nextAttempts;

      if (import.meta.env.DEV) {
        console.error("[Login] signInWithPassword failed:", classified.code);
      }

      setAuthError(
        `${classified.message} (${remainingAttempts} attempt${
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
      await verifyTotpChallenge(supabase.auth.mfa, {
        factorId: mfaFactorId,
        code: mfaCode,
      });
      setMfaPending(false);
      setMfaFactorId(null);
      setMfaCode("");
    } catch (error) {
      setAuthError(classifyLoginFailure(error).message);
    } finally {
      setMfaVerifying(false);
    }
  }

  return (
    <AuthShell testimonial={TESTIMONIAL}>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              {accountSuspended
                ? "Account suspended"
                : mfaPending
                  ? "Two-factor authentication"
                  : "Welcome back"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {accountSuspended
                ? "This account cannot sign in right now."
                : mfaPending
                  ? "Enter the 6-digit code from your authenticator app"
                  : "Sign in to Career Pilot"}
            </p>
          </div>

          {accountSuspended ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError || ACCOUNT_SUSPENDED_MESSAGE}</span>
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={supportMailto("Career Pilot suspended account")}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition"
                >
                  Contact support
                </a>
                <Link
                  to="/help"
                  className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition"
                >
                  {PUBLIC_CTAS.help}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  fullWidth
                  onClick={() => {
                    setAccountSuspended(false);
                    setAuthError(null);
                  }}
                >
                  Try a different account
                </Button>
              </div>
            </div>
          ) : mfaPending ? (
            <div className="space-y-4">
              <Input
                label="Authenticator code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
          <div>
          <OAuthProviderSection dividerLabel="or sign in with email" />

          <form
            className="space-y-4"
            noValidate
            onSubmit={handleSubmit(
              (data, event) => handleLogin(data, event),
              focusFirstInvalidLoginField,
            )}
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
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                }
              />

              <div className="flex items-center justify-between pt-2 mt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-8">
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
                    . Server-side rate limits still apply even
                    if this device lock is cleared.
                  </p>
                </div>
              </div>
            )}

            {displayedError && !isLocked && (
              <div
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{displayedError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              disabled={isLocked || isSubmitting || authStatus === "loading"}
              fullWidth
            >
              {isLocked ? `Locked (${lockMinsLeft}m)` : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{" "}
            <Link
              to={signupHref}
              className="text-primary font-medium hover:opacity-80 transition-opacity"
            >
              {PUBLIC_CTAS.signup}
            </Link>
          </p>
          </div>
          )}
    </AuthShell>
  );
}
