// src/pages/auth/ResetPassword.tsx
//
// Two-phase password reset page.
//
// Phase 1:
// /forgot-password
// User enters email → sends reset link.
//
// Phase 2:
// /reset-password
// User arrives via recovery link → sets new password.
//
// Supabase handles the recovery token through URL hash/search parameters.
// This page validates forms using FormWrapper + Zod schemas.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/store/authStore";
import { usePageMeta } from "@/hooks/usePageMeta";

import { FormWrapper } from "@/components/common/FormWrapper";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  resetPasswordSchema,
  updatePasswordSchema,
  type ResetPasswordInput,
  type UpdatePasswordInput,
} from "@/lib/validators";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PageMode = "request" | "reset" | "success-request" | "success-reset";

type PasswordStrength = {
  score: number;
  label: string;
  color: "red" | "orange" | "yellow" | "blue" | "green";
  feedback: string[];
  isAcceptable: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supabase Auth appends `#error=...&error_code=...&error_description=...`
 * (or the same as query params, depending on flow) when a recovery link is
 * expired, already used, or otherwise invalid. Without this check the user
 * silently lands on the "request a new link" form with no explanation.
 */
function getRecoveryLinkIssue(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  const errorCode = hashParams.get("error_code") ?? searchParams.get("error_code");
  const error = hashParams.get("error") ?? searchParams.get("error");
  const errorDescription =
    hashParams.get("error_description") ?? searchParams.get("error_description");

  if (!error && !errorCode) {
    return null;
  }

  if (errorCode === "otp_expired") {
    return "This reset link has expired. Please request a new one.";
  }

  if (errorDescription) {
    // URLSearchParams already decodes percent-encoding and "+" as space.
    return errorDescription;
  }

  return "This reset link is invalid or has already been used. Please request a new one.";
}

function isRecoveryUrl(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const pathname = window.location.pathname;
  const hash = window.location.hash;
  const search = window.location.search;

  return (
    pathname.includes("reset-password") &&
    (hash.includes("access_token") ||
      hash.includes("type=recovery") ||
      search.includes("type=recovery") ||
      // PKCE / OTP-style recovery links
      new URLSearchParams(search).has("code") ||
      new URLSearchParams(search).has("token_hash"))
  );
}

/**
 * Turn a PKCE (`?code=`) or OTP (`?token_hash=`) recovery link into a session.
 * Implicit-flow links (`#access_token=`) are handled by the Supabase client itself.
 */
async function establishRecoverySession(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return false;
    } else if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (error) return false;
    } else {
      return false;
    }

    // Strip the single-use token from the address bar.
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  } catch {
    return false;
  }
}


function getPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];

  if (!password) {
    return {
      score: 0,
      label: "",
      color: "red",
      feedback: [],
      isAcceptable: false,
    };
  }

  let score = 0;

  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push("Use at least 8 characters.");
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push("Add an uppercase letter.");
  }

  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push("Add a number.");
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push("Add a special character.");
  }

  if (score <= 1) {
    return {
      score: 1,
      label: "Weak",
      color: "red",
      feedback,
      isAcceptable: false,
    };
  }

  if (score <= 2) {
    return {
      score: 2,
      label: "Fair",
      color: "orange",
      feedback,
      isAcceptable: false,
    };
  }

  if (score <= 3) {
    return {
      score: 3,
      label: "Good",
      color: "yellow",
      feedback,
      isAcceptable: password.length >= 8,
    };
  }

  if (score <= 4) {
    return {
      score: 4,
      label: "Strong",
      color: "blue",
      feedback,
      isAcceptable: true,
    };
  }

  return {
    score: 5,
    label: "Excellent",
    color: "green",
    feedback,
    isAcceptable: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Password Strength Bar
// ─────────────────────────────────────────────────────────────────────────────

function PasswordStrengthBar({ password }: { password: string }): JSX.Element | null {
  const strength = getPasswordStrength(password);

  if (!password) {
    return null;
  }

  const colorMap: Record<PasswordStrength["color"], string> = {
    red: "bg-red-500",
    orange: "bg-orange-500",
    yellow: "bg-yellow-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-1.5"
    >
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              index < strength.score ? colorMap[strength.color] : "bg-muted"
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span
          className={cn("text-xs font-medium", {
            "text-red-500": strength.color === "red",
            "text-orange-500": strength.color === "orange",
            "text-yellow-600": strength.color === "yellow",
            "text-blue-500": strength.color === "blue",
            "text-green-500": strength.color === "green",
          })}
        >
          {strength.label}
        </span>

        {strength.feedback.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {strength.feedback[0]}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ResetPassword(): JSX.Element {
  const navigate = useNavigate();

  const sendPasswordReset = useAuthStore((state) => state.sendPasswordReset);
  const updatePassword = useAuthStore((state) => state.updatePassword);

  const initialMode = useMemo<PageMode>(
    () => (isRecoveryUrl() ? "reset" : "request"),
    []
  );

  const [mode, setMode] = useState<PageMode>(initialMode);

  usePageMeta({
    title:
      mode === "reset"
        ? "Reset password | Clarify AI"
        : "Forgot password | Clarify AI",
    description: "Reset your Clarify AI account password.",
    noIndex: true,
  });

  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  // Runs once: surface a friendly message when the user arrives via an
  // expired/invalid/already-used recovery link instead of silently showing
  // a blank "request a new link" form.
  useEffect(() => {
    const issue = getRecoveryLinkIssue();
    if (!issue) {
      return;
    }

    setMode("request");
    setGeneralError(issue);
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "reset") {
      return;
    }

    let cancelled = false;

    async function verifyRecoverySession(): Promise<void> {
      try {
        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          // PKCE / OTP links need an explicit exchange before a session exists.
          const exchanged = await establishRecoverySession();
          if (exchanged) {
            session = (await supabase.auth.getSession()).data.session;
          }
        }

        if (cancelled) {
          return;
        }

        if (!session) {
          setMode("request");
          setGeneralError(
            "This reset link has expired. Please request a new one."
          );
        }
      } catch {
        if (!cancelled) {
          setMode("request");
          setGeneralError(
            "This reset link could not be verified. Please request a new one."
          );
        }
      }
    }


    void verifyRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "success-reset") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate(ROUTES.DASHBOARD);
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mode, navigate]);

  async function handleRequestReset(data: ResetPasswordInput): Promise<void> {
    setGeneralError(null);

    try {
      await sendPasswordReset(data.email);
      setSubmittedEmail(data.email);
      setMode("success-request");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send reset email. Please try again.";

      setGeneralError(message);
    }
  }

  async function handleSetPassword(data: UpdatePasswordInput): Promise<void> {
    setGeneralError(null);

    try {
      await updatePassword(data.password);
      setMode("success-reset");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update password. The link may have expired.";

      setGeneralError(message);
    }
  }

  return (
    <AuthShell mobileTitle="Reset password">
    <div className="w-full">
      <AnimatePresence mode="wait">
        {/* keep existing phase cards */}
        {/* Phase 1: Request reset link */}
        {mode === "request" && (
          <motion.div
            key="request"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-xl border-border/60">
              <CardHeader className="space-y-2 text-center pb-2">
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                  <KeyRound className="h-7 w-7 text-primary" />
                </div>

                <CardTitle className="text-2xl font-bold">
                  Forgot your password?
                </CardTitle>

                <CardDescription>
                  Enter your email and we&apos;ll send you a reset link.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4">
                <AnimatePresence>
                  {generalError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4"
                    >
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{generalError}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <FormWrapper<ResetPasswordInput>
                  schema={resetPasswordSchema}
                  onSubmit={handleRequestReset}
                  className="space-y-4"
                  validateCsrf
                >
                  {({ fieldErrors, formError, isSubmitting }) => (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email address</Label>

                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />

                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            autoFocus
                            disabled={isSubmitting}
                            className={cn(
                              "pl-9",
                              fieldErrors.email?.[0] &&
                                "border-destructive focus-visible:ring-destructive"
                            )}
                            aria-invalid={Boolean(fieldErrors.email?.[0])}
                            aria-describedby={
                              fieldErrors.email?.[0] ? "email-error" : undefined
                            }
                          />
                        </div>

                        {fieldErrors.email?.[0] && (
                          <p
                            id="email-error"
                            className="text-xs text-destructive flex items-center gap-1"
                          >
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.email[0]}
                          </p>
                        )}
                      </div>

                      {formError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting}
                        size="lg"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          "Send reset link"
                        )}
                      </Button>
                    </>
                  )}
                </FormWrapper>
              </CardContent>

              <CardFooter className="justify-center">
                <Link
                  to={ROUTES.LOGIN}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {/* Success: Email sent */}
        {mode === "success-request" && (
          <motion.div
            key="success-request"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-xl border-border/60 text-center">
              <CardHeader className="space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.1,
                  }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
                >
                  <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
                </motion.div>

                <CardTitle className="text-xl font-bold">
                  Check your inbox
                </CardTitle>

                <CardDescription className="text-base">
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">
                    {submittedEmail}
                  </span>
                  . The link expires in 1 hour.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Didn&apos;t receive it? Check your spam folder, or{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("request");
                      setGeneralError(null);
                    }}
                    className="font-medium text-primary underline underline-offset-4 hover:no-underline"
                  >
                    try a different email
                  </button>
                  .
                </p>
              </CardContent>

              <CardFooter className="justify-center">
                <Link
                  to={ROUTES.LOGIN}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {/* Phase 2: Set new password */}
        {mode === "reset" && (
          <motion.div
            key="reset"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-xl border-border/60">
              <CardHeader className="space-y-2 text-center pb-2">
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                  <Lock className="h-7 w-7 text-primary" />
                </div>

                <CardTitle className="text-2xl font-bold">
                  Set new password
                </CardTitle>

                <CardDescription>
                  Choose a strong password. You&apos;ll use it next time you
                  sign in.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4">
                <AnimatePresence>
                  {generalError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4"
                    >
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{generalError}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <FormWrapper<UpdatePasswordInput>
                  schema={updatePasswordSchema}
                  onSubmit={handleSetPassword}
                  className="space-y-4"
                  validateCsrf
                >
                  {({ fieldErrors, formError, isSubmitting }) => (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="password">New password</Label>

                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />

                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Minimum 8 characters"
                            autoComplete="new-password"
                            autoFocus
                            disabled={isSubmitting}
                            onChange={(event) => setPassword(event.target.value)}
                            className={cn(
                              "pl-9 pr-10",
                              fieldErrors.password?.[0] &&
                                "border-destructive focus-visible:ring-destructive"
                            )}
                            aria-invalid={Boolean(fieldErrors.password?.[0])}
                            aria-describedby={
                              fieldErrors.password?.[0]
                                ? "password-error"
                                : undefined
                            }
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowPassword((value) => !value)
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        <AnimatePresence>
                          {password && (
                            <PasswordStrengthBar password={password} />
                          )}
                        </AnimatePresence>

                        {fieldErrors.password?.[0] && (
                          <p
                            id="password-error"
                            className="text-xs text-destructive flex items-center gap-1"
                          >
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.password[0]}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-password">
                          Confirm new password
                        </Label>

                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />

                          <Input
                            id="confirm-password"
                            name="confirmPassword"
                            type={showConfirm ? "text" : "password"}
                            placeholder="Repeat your password"
                            autoComplete="new-password"
                            disabled={isSubmitting}
                            className={cn(
                              "pl-9 pr-10",
                              fieldErrors.confirmPassword?.[0] &&
                                "border-destructive focus-visible:ring-destructive"
                            )}
                            aria-invalid={Boolean(
                              fieldErrors.confirmPassword?.[0]
                            )}
                            aria-describedby={
                              fieldErrors.confirmPassword?.[0]
                                ? "confirm-error"
                                : undefined
                            }
                          />

                          <button
                            type="button"
                            onClick={() => setShowConfirm((value) => !value)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={
                              showConfirm ? "Hide password" : "Show password"
                            }
                          >
                            {showConfirm ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {fieldErrors.confirmPassword?.[0] && (
                          <p
                            id="confirm-error"
                            className="text-xs text-destructive flex items-center gap-1"
                          >
                            <AlertCircle className="h-3 w-3" />
                            {fieldErrors.confirmPassword[0]}
                          </p>
                        )}
                      </div>

                      {formError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting || !strength.isAcceptable}
                        size="lg"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating…
                          </>
                        ) : (
                          "Update password"
                        )}
                      </Button>
                    </>
                  )}
                </FormWrapper>
              </CardContent>

              <CardFooter className="justify-center">
                <Link
                  to={ROUTES.LOGIN}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {/* Success: Password updated */}
        {mode === "success-reset" && (
          <motion.div
            key="success-reset"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-xl border-border/60 text-center">
              <CardHeader className="space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.1,
                  }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
                >
                  <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
                </motion.div>

                <CardTitle className="text-xl font-bold">
                  Password updated!
                </CardTitle>

                <CardDescription className="text-base">
                  Your password has been changed successfully. Redirecting you
                  to the dashboard…
                </CardDescription>
              </CardHeader>

              <CardContent>
                <motion.div
                  className="h-1 w-full rounded-full bg-primary"
                  initial={{ scaleX: 0, originX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 3, ease: "linear" }}
                />

                <p className="mt-3 text-xs text-muted-foreground">
                  Redirecting in 3 seconds…
                </p>
              </CardContent>

              <CardFooter className="justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(ROUTES.DASHBOARD)}
                >
                  Go to dashboard now
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </AuthShell>
  );
}
