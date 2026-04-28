// ─────────────────────────────────────────────────────────────────────────────
// ResetPassword.tsx — Two-phase password reset page.
// Phase 1 (/forgot-password): user enters email → sends reset link.
// Phase 2 (/reset-password):  user arrives via email link → sets new password.
// Supabase handles the token via the URL hash (#access_token=...).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, type ChangeEvent, type FormEvent }  from "react";
import { useNavigate, Link }    from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { supabase }             from "@/lib/supabase/client";
import { ROUTES }               from "@/lib/constants";
import {
  validateEmail,
  validatePassword,
  getPasswordStrength,
} from "@/lib/validators";

import { Button }               from "@/components/ui/Button";
import { Input }                from "@/components/ui/Input";
import { Label }                from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
}                               from "@/components/ui/Card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn }                   from "@/lib/utils";

import {
  Mail, Lock, Eye, EyeOff,
  ArrowLeft, CheckCircle2,
  AlertCircle, Loader2, KeyRound,
}                               from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageMode = "request" | "reset" | "success-request" | "success-reset";

interface FormState {
  email:           string;
  password:        string;
  confirmPassword: string;
}

interface FormErrors {
  email?:          string;
  password?:       string;
  confirmPassword?: string;
  general?:        string;
}

// ─── Password Strength Bar ────────────────────────────────────────────────────

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = getPasswordStrength(password);

  if (!password) return null;

  const colorMap = {
    red:    "bg-red-500",
    orange: "bg-orange-500",
    yellow: "bg-yellow-500",
    blue:   "bg-blue-500",
    green:  "bg-green-500",
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-1.5"
    >
      {/* Segmented bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              i <= strength.score
                ? colorMap[strength.color]
                : "bg-muted"
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", {
          "text-red-500":    strength.color === "red",
          "text-orange-500": strength.color === "orange",
          "text-yellow-600": strength.color === "yellow",
          "text-blue-500":   strength.color === "blue",
          "text-green-500":  strength.color === "green",
        })}>
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResetPassword() {
  const navigate = useNavigate();

  // Determine mode from URL
  const isResetMode = window.location.pathname.includes("reset-password") &&
                      (window.location.hash.includes("access_token") ||
                       window.location.search.includes("type=recovery"));

  const [mode,         setMode]         = useState<PageMode>(isResetMode ? "reset" : "request");
  const [form,         setForm]         = useState<FormState>({
    email: "", password: "", confirmPassword: "",
  });
  const [errors,       setErrors]       = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);

  // Supabase uses hash params for recovery tokens — exchange them on mount
  useEffect(() => {
    if (!isResetMode) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Token expired or invalid — go back to request
        setMode("request");
        setErrors({ general: "This reset link has expired. Please request a new one." });
      }
    });
  }, [isResetMode]);

  // ── Field helpers ────────────────────────────────────────────────────────────

  const setField = (field: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field as keyof FormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  // ── Phase 1: Request reset email ─────────────────────────────────────────────

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();

    const emailResult = validateEmail(form.email);
    if (!emailResult.valid) {
      setErrors({ email: emailResult.error });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: `${window.location.origin}${ROUTES.RESET_PASSWORD}`,
      });

      if (error) throw error;

      setMode("success-request");
    } catch (err) {
      setErrors({
        general: (err as Error).message ?? "Failed to send reset email. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Phase 2: Set new password ────────────────────────────────────────────────

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors: FormErrors = {};

    const passwordResult = validatePassword(form.password);
    if (!passwordResult.valid) newErrors.password = passwordResult.error;

    if (!form.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your new password.";
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    const strength = getPasswordStrength(form.password);
    if (strength.isAcceptable === false && !newErrors.password) {
      newErrors.password = "Password is too weak. Add uppercase letters, numbers, or symbols.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const { error } = await supabase.auth.updateUser({
        password: form.password,
      });

      if (error) throw error;

      setMode("success-reset");

      // Auto-redirect to dashboard after 3 s
      setTimeout(() => navigate(ROUTES.DASHBOARD), 3000);
    } catch (err) {
      setErrors({
        general: (err as Error).message ?? "Failed to update password. The link may have expired.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const strength = getPasswordStrength(form.password);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
      <AnimatePresence mode="wait">

        {/* ── Phase 1: Request Reset ────────────────────────────────────── */}
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
                <CardTitle className="text-2xl font-bold">Forgot your password?</CardTitle>
                <CardDescription>
                  Enter your email and we'll send you a reset link.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4">
                {/* General error */}
                <AnimatePresence>
                  {errors.general && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4"
                    >
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{errors.general}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleRequestReset} className="space-y-4" noValidate>
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={setField("email")}
                        autoComplete="email"
                        autoFocus
                        disabled={isLoading}
                        className={cn(
                          "pl-9",
                          errors.email && "border-destructive focus-visible:ring-destructive"
                        )}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "email-error" : undefined}
                      />
                    </div>
                    {errors.email && (
                      <p id="email-error" className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.email}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    size="lg"
                  >
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>
                </form>
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

        {/* ── Success: Email Sent ───────────────────────────────────────── */}
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
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
                >
                  <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
                </motion.div>
                <CardTitle className="text-xl font-bold">Check your inbox</CardTitle>
                <CardDescription className="text-base">
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{form.email}</span>.
                  The link expires in 24 hours.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Didn't receive it? Check your spam folder, or{" "}
                  <button
                    type="button"
                    onClick={() => setMode("request")}
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

        {/* ── Phase 2: Set New Password ─────────────────────────────────── */}
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
                <CardTitle className="text-2xl font-bold">Set new password</CardTitle>
                <CardDescription>
                  Choose a strong password. You'll use it next time you sign in.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4">
                {/* General error */}
                <AnimatePresence>
                  {errors.general && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4"
                    >
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{errors.general}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSetPassword} className="space-y-4" noValidate>
                  {/* New Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="password">New password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimum 8 characters"
                        value={form.password}
                        onChange={setField("password")}
                        autoComplete="new-password"
                        autoFocus
                        disabled={isLoading}
                        className={cn(
                          "pl-9 pr-10",
                          errors.password && "border-destructive focus-visible:ring-destructive"
                        )}
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password ? "password-error" : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword
                          ? <EyeOff className="h-4 w-4" />
                          : <Eye className="h-4 w-4" />
                        }
                      </button>
                    </div>

                    {/* Strength bar */}
                    <AnimatePresence>
                      {form.password && <PasswordStrengthBar password={form.password} />}
                    </AnimatePresence>

                    {errors.password && (
                      <p id="password-error" className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.password}
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repeat your password"
                        value={form.confirmPassword}
                        onChange={setField("confirmPassword")}
                        autoComplete="new-password"
                        disabled={isLoading}
                        className={cn(
                          "pl-9 pr-10",
                          errors.confirmPassword && "border-destructive focus-visible:ring-destructive",
                          form.confirmPassword && form.password === form.confirmPassword &&
                            "border-green-500 focus-visible:ring-green-500"
                        )}
                        aria-invalid={Boolean(errors.confirmPassword)}
                        aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                      >
                        {showConfirm
                          ? <EyeOff className="h-4 w-4" />
                          : <Eye className="h-4 w-4" />
                        }
                      </button>
                    </div>

                    {/* Match indicator */}
                    <AnimatePresence>
                      {form.confirmPassword && form.password === form.confirmPassword && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Passwords match
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {errors.confirmPassword && (
                      <p id="confirm-error" className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.confirmPassword}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || !strength.isAcceptable}
                    size="lg"
                  >
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</>
                    ) : (
                      "Update password"
                    )}
                  </Button>
                </form>
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

        {/* ── Success: Password Updated ─────────────────────────────────── */}
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
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
                >
                  <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
                </motion.div>
                <CardTitle className="text-xl font-bold">Password updated!</CardTitle>
                <CardDescription className="text-base">
                  Your password has been changed successfully.
                  Redirecting you to the dashboard…
                </CardDescription>
              </CardHeader>

              <CardContent>
                {/* Auto-redirect progress bar */}
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
  );
}
