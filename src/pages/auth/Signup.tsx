// @ts-nocheck
import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Eye, EyeOff, AlertCircle, CheckCircle, Sparkles, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: "Weak",   color: "bg-red-500" };
  if (score <= 2) return { score: 2, label: "Fair",   color: "bg-amber-500" };
  if (score <= 3) return { score: 3, label: "Good",   color: "bg-yellow-500" };
  if (score <= 4) return { score: 4, label: "Strong", color: "bg-emerald-500" };
  return                { score: 5, label: "Excellent", color: "bg-emerald-500" };
}

const BENEFITS = [
  { icon: Sparkles, text: "AI-powered mock interviews" },
  { icon: Zap,      text: "Real-time coaching & feedback" },
  { icon: Shield,   text: "Practice unlimited for free" },
];

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") ?? null;

  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [done,      setDone]      = useState(false);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    if (refCode) {
      localStorage.setItem("clarify_ref", refCode);
    }

    const redirectUrl = refCode
      ? `${window.location.origin}/onboarding/step-1?ref=${refCode}`
      : `${window.location.origin}/onboarding/step-1`;

    const { error: authError } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
      options: {
        data:            { full_name: name.trim() },
        emailRedirectTo: redirectUrl,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setDone(true);
  }

  async function handleGoogle() {
    if (refCode) {
      localStorage.setItem("clarify_ref", refCode);
    }

    const redirectUrl = refCode
      ? `${window.location.origin}/onboarding/step-1?ref=${refCode}`
      : `${window.location.origin}/onboarding/step-1`;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options:  { redirectTo: redirectUrl },
    });
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Check your email</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
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
      {/* ── Left panel — brand / decorative ─────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 p-10">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-white blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-white blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-9 w-auto brightness-0 invert" />
            <span className="text-xl font-bold text-white">Clarify AI</span>
          </div>

          {/* Middle content */}
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
              Join thousands of engineers who practice smarter and interview with confidence.
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

          {/* Trust badge */}
          <div className="bg-white/10 border border-white/15 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex -space-x-2">
                {["E", "M", "J", "A"].map((l) => (
                  <div key={l} className="w-7 h-7 rounded-full bg-indigo-400/40 border-2 border-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {l}
                  </div>
                ))}
              </div>
              <p className="text-white text-xs font-semibold">50,000+ engineers trained</p>
            </div>
            <p className="text-indigo-200 text-xs">
              Trusted by engineers at Google, Meta, Amazon, Apple, Microsoft and more.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 w-full max-w-sm">
          <div className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center gap-2">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-7 w-auto brightness-0 invert" />
            <span className="text-lg font-bold text-white">Clarify AI</span>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
            <p className="text-muted-foreground text-sm mt-1">Start your interview prep journey today</p>
          </div>

          {refCode && (
            <div className="mb-4 px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary text-center">
              Referral code <span className="font-mono font-bold">{refCode}</span> applied — you'll both earn bonus credits!
            </div>
          )}

          {/* Google OAuth */}
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleGoogle}
            leftIcon={
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            }
          >
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or sign up with email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              autoComplete="name"
              required
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <div className="space-y-1.5">
              <Input
                label="Password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                required
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPw((p) => !p)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-all duration-300",
                          n <= pwStrength.score ? pwStrength.color : "bg-border"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Password strength: <span className="font-medium text-foreground">{pwStrength.label}</span>
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="md" loading={loading} fullWidth>
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:opacity-80 transition-opacity">
              Sign in
            </Link>
          </p>

          <p className="text-center text-[11px] text-muted-foreground mt-4 leading-relaxed">
            By signing up you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground transition-colors">Terms</Link> and{" "}
            <Link to="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
