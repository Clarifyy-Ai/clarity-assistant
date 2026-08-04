import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";

import { useAuthStore } from "@/store/authStore";
import { usePageMeta } from "@/hooks/usePageMeta";
import { BrandLogo } from "@/components/marketing";
import { AuthShell } from "@/components/layout/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

import {
  GoogleOAuthButton,
  GithubOAuthButton,
  LinkedInOAuthButton,
  AzureOAuthButton,
} from "@/components/auth/OAuthButton";

import { signupSchema } from "@/lib/validators";
import { getCSRFHiddenInputProps, sanitizeText, validateCSRFToken } from "@/lib/security";
import { cn } from "@/lib/utils";

type PasswordStrength = {
  score: number;
  label: string;
  color: string;
};

const REFERRAL_STORAGE_KEY = "clarify_ref";
const PENDING_PLAN_STORAGE_KEY = "clarify_pending_plan";
const SIGNUP_PLANS = ["starter", "pro", "enterprise"] as const;

const BENEFITS = [
  {
    icon: Sparkles,
    text: "AI-powered mock interviews",
  },
  {
    icon: Zap,
    text: "Real-time coaching & feedback",
  },
  {
    icon: Shield,
    text: "Practice unlimited for free",
  },
];

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: "",
      color: "",
    };
  }

  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return {
      score: 1,
      label: "Weak",
      color: "bg-red-500",
    };
  }

  if (score <= 2) {
    return {
      score: 2,
      label: "Fair",
      color: "bg-amber-500",
    };
  }

  if (score <= 3) {
    return {
      score: 3,
      label: "Good",
      color: "bg-yellow-500",
    };
  }

  if (score <= 4) {
    return {
      score: 4,
      label: "Strong",
      color: "bg-emerald-500",
    };
  }

  return {
    score: 5,
    label: "Excellent",
    color: "bg-emerald-500",
  };
}

function safeSetLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function normalizeReferralCode(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const sanitized = sanitizeText(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * FormData checkboxes arrive as string values like "true" or "on".
 * Preprocess before the central signupSchema (a refined schema — not extendable).
 */
const signupFormSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object") {
      const data = { ...(raw as Record<string, unknown>) };
      const value = data.acceptTerms;
      data.acceptTerms =
        value === true || value === "true" || value === "on";
      return data;
    }
    return raw;
  },
  signupSchema
);

type SignupFormInput = z.infer<typeof signupSchema>;

export default function Signup(): JSX.Element {
  usePageMeta({
    title: "Create account | Clarify AI",
    description: "Create your Clarify AI account.",
    noIndex: true,
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawRefCode = searchParams.get("ref");
  const refCode = useMemo(() => normalizeReferralCode(rawRefCode), [rawRefCode]);

  const authStatus = useAuthStore((state) => state.status);
  const signUpWithEmail = useAuthStore((state) => state.signUpWithEmail);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string>("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<SignupFormInput>({
    resolver: zodResolver(signupFormSchema),
    mode: "onChange",
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const password = watch("password");
  const acceptTerms = watch("acceptTerms");
  const isFormValid = isValid;

  useEffect(() => {
    if (authStatus === "authenticated") {
      navigate("/app/dashboard", { replace: true });
    }
  }, [authStatus, navigate]);

  useEffect(() => {
    if (refCode) {
      safeSetLocalStorageItem(REFERRAL_STORAGE_KEY, refCode);
    }
  }, [refCode]);

  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan && (SIGNUP_PLANS as readonly string[]).includes(plan)) {
      safeSetLocalStorageItem(PENDING_PLAN_STORAGE_KEY, plan);
    }
  }, [searchParams]);

  const passwordStrength = useMemo(
    () => getPasswordStrength(password ?? ""),
    [password]
  );

  const passwordChecks = useMemo(
    () => ({
      length: (password ?? "").length >= 8,
      upper: /[A-Z]/.test(password ?? ""),
      number: /[0-9]/.test(password ?? ""),
      special: /[^A-Za-z0-9]/.test(password ?? ""),
    }),
    [password]
  );

  async function handleSignup(
    data: SignupFormInput,
    event?: React.BaseSyntheticEvent
  ): Promise<void> {
    setFormError(null);

    const formEl = event?.target as HTMLFormElement | undefined;
    if (formEl) {
      const formData = new FormData(formEl);
      const token = formData.get("csrfToken");
      if (typeof token !== "string" || !validateCSRFToken(token)) {
        setFormError("Security token expired. Please refresh and try again.");
        return;
      }
    }

    if (refCode) {
      safeSetLocalStorageItem(REFERRAL_STORAGE_KEY, refCode);
    }

    try {
      await signUpWithEmail(data.email, data.password, data.fullName);

      setSubmittedEmail(data.email);
      setDone(true);

      // Single canonical "verify your email" surface (supports resend + auto-redirect).
      navigate("/verify-email", { replace: true, state: { email: data.email } });

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create account. Please try again.";

      setFormError(message);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7 text-emerald-500" />
          </div>

          <h2 className="text-xl font-bold text-foreground">
            Check your email
          </h2>

          <p className="text-muted-foreground text-sm leading-relaxed">
            We sent a confirmation link to{" "}
            <strong className="text-foreground">{submittedEmail}</strong>.
            Click it to activate your account and start onboarding.
          </p>

          <Link
            to="/login"
            className="inline-block text-sm text-primary font-medium hover:opacity-80 transition-opacity"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AuthShell>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-foreground">
              Create your account
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Start your interview prep journey today
            </p>
          </div>

          {refCode && (
            <div className="mb-4 px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary text-center">
              Referral code{" "}
              <span className="font-mono font-bold">{refCode}</span> applied —
              you&apos;ll both earn bonus credits!
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <GoogleOAuthButton />
            <GithubOAuthButton />
            <LinkedInOAuthButton />
            <AzureOAuthButton />
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">
              or sign up with email
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form
            className="space-y-4"
            noValidate
            onSubmit={handleSubmit((data, event) => handleSignup(data, event))}
          >
            <input {...getCSRFHiddenInputProps()} />
            <Input
              label="Full name"
              type="text"
              placeholder="Jane Smith"
              autoComplete="name"
              required
              error={errors.fullName?.message}
              {...register("fullName")}
            />

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="space-y-1.5">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
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

              {(password?.length ?? 0) > 0 && (
                <div id="password-requirements" className="space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-all duration-300",
                          level <= passwordStrength.score
                            ? passwordStrength.color
                            : "bg-border"
                        )}
                      />
                    ))}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Password strength:{" "}
                    <span className="font-medium text-foreground">
                      {passwordStrength.label}
                    </span>
                  </p>

                  <ul className="text-[11px] space-y-0.5 mt-1.5">
                    {[
                      {
                        ok: passwordChecks.length,
                        text: "At least 8 characters",
                      },
                      {
                        ok: passwordChecks.upper,
                        text: "One uppercase letter (A-Z)",
                      },
                      {
                        ok: passwordChecks.number,
                        text: "One number (0-9)",
                      },
                      {
                        ok: passwordChecks.special,
                        text: "One special character (!@#$…)",
                      },
                    ].map((check) => (
                      <li
                        key={check.text}
                        className={cn(
                          "flex items-center gap-1.5",
                          check.ok
                            ? "text-emerald-500"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="inline-block w-3 text-center">
                          {check.ok ? "✓" : "○"}
                        </span>
                        {check.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Input
              label="Confirm password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              }
            />


            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(acceptTerms)}
                onChange={(event) =>
                  setValue("acceptTerms", event.target.checked, {
                    shouldValidate: true,
                  })
                }
                required
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
              />

              <span className="text-[12px] text-muted-foreground leading-snug">
                I agree to the{" "}
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:opacity-80"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:opacity-80"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            {errors.acceptTerms?.message && (
              <p role="alert" className="text-xs text-destructive">
                {errors.acceptTerms.message}
              </p>
            )}

            {formError && (
              <div role="alert" className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              disabled={isSubmitting || !isFormValid}
              fullWidth
            >
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary font-medium hover:opacity-80 transition-opacity"
            >
              Sign in
            </Link>
          </p>
    </AuthShell>
  );
}
