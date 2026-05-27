import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
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
import { FormWrapper } from "@/components/common/FormWrapper";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

import {
  GoogleOAuthButton,
  GithubOAuthButton,
  LinkedInOAuthButton,
  AzureOAuthButton,
} from "@/components/auth/OAuthButton";

import { signupSchema, type SignupInput } from "@/lib/validators";
import { sanitizeText } from "@/lib/security";
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
 * This local schema keeps the central signupSchema behavior while making
 * browser FormData checkbox submission compatible.
 */
const signupFormSchema = (signupSchema as any).extend({
  acceptTerms: z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean().refine((accepted) => accepted === true, {
      message: "You must accept the terms and privacy policy.",
    })
  ),
});

type SignupFormInput = z.infer<typeof signupFormSchema>;

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

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string>("");

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
    () => getPasswordStrength(password),
    [password]
  );

  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    }),
    [password]
  );

  async function handleSignup(data: SignupFormInput): Promise<void> {
    setFormError(null);

    if (refCode) {
      safeSetLocalStorageItem(REFERRAL_STORAGE_KEY, refCode);
    }

    try {
      await signUpWithEmail(data.email, data.password, data.fullName);

      setSubmittedEmail(data.email);
      setDone(true);
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
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 p-10">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-white blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-white blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-3">
            <img
              src="/images/clarify-logo.png"
              alt="Clarify AI"
              className="h-9 w-auto brightness-0 invert"
            />
            <span className="text-xl font-bold text-white">Clarify AI</span>
          </div>

          <div className="flex-1 flex flex-col justify-center mt-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-white text-xs font-medium w-fit mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Free to start — no credit card needed
            </div>

            <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
              Ace your next
              <br />
              <span className="text-indigo-200">interview</span>
            </h2>

            <p className="text-indigo-100 text-base leading-relaxed max-w-sm mb-8">
              Join thousands of engineers who practice smarter and interview
              with confidence.
            </p>

            <div className="space-y-3">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-indigo-100 text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex -space-x-2">
                {["E", "M", "J", "A"].map((letter) => (
                  <div
                    key={letter}
                    className="w-7 h-7 rounded-full bg-indigo-400/40 border-2 border-indigo-600 flex items-center justify-center text-white text-[10px] font-bold"
                  >
                    {letter}
                  </div>
                ))}
              </div>

              <p className="text-white text-xs font-semibold">
                AI-powered interview coaching
              </p>
            </div>

            <p className="text-indigo-200 text-xs">
              Practice mock interviews, live co-pilot sessions, and gov exam prep in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12">
        <div className="lg:hidden mb-8 w-full max-w-sm">
          <div className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center gap-2">
            <img
              src="/images/clarify-logo.png"
              alt="Clarify AI"
              className="h-7 w-auto brightness-0 invert"
            />
            <span className="text-lg font-bold text-white">Clarify AI</span>
          </div>
        </div>

        <div className="w-full max-w-sm">
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

          <FormWrapper<SignupFormInput>
            schema={signupFormSchema}
            onSubmit={handleSignup}
            className="space-y-4"
            validateCsrf
          >
            {({ fieldErrors, formError: validationFormError, isSubmitting }) => (
              <>
                <Input
                  label="Full name"
                  name="fullName"
                  type="text"
                  placeholder="Jane Smith"
                  autoComplete="name"
                  required
                />

                {fieldErrors.fullName?.[0] && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.fullName[0]}
                  </p>
                )}

                <Input
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />

                {fieldErrors.email?.[0] && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.email[0]}
                  </p>
                )}

                <div className="space-y-1.5">
                  <Input
                    label="Password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    required
                    onChange={(event) => setPassword(event.target.value)}
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

                  {fieldErrors.password?.[0] && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.password[0]}
                    </p>
                  )}

                  {password.length > 0 && (
                    <div className="space-y-1.5">
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
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                />

                {fieldErrors.confirmPassword?.[0] && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.confirmPassword[0]}
                  </p>
                )}

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="acceptTerms"
                    value="true"
                    checked={acceptTerms}
                    onChange={(event) => setAcceptTerms(event.target.checked)}
                    required
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  />

                  <span className="text-[12px] text-muted-foreground leading-snug">
                    I agree to the{" "}
                    <Link
                      to="/terms"
                      className="text-primary underline hover:opacity-80"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      className="text-primary underline hover:opacity-80"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                {fieldErrors.acceptTerms?.[0] && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.acceptTerms[0]}
                  </p>
                )}

                {(formError || validationFormError) && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError ?? validationFormError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  fullWidth
                >
                  Create account
                </Button>
              </>
            )}
          </FormWrapper>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary font-medium hover:opacity-80 transition-opacity"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
