import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  GoogleOAuthButton,
  GithubOAuthButton,
  LinkedInOAuthButton,
  AzureOAuthButton,
} from "@/components/auth/OAuthButton";
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

  // Redirect if already authenticated
  const authStatus = useAuthStore((s) => s.status);
  useEffect(() => {
    if (authStatus === "authenticated") {
      navigate("/app/dashboard", { replace: true });
    }
  }, [authStatus, navigate]);

  // Persist refCode to localStorage immediately so it survives
  // the OAuth browser redirect (OAuth buttons use useAuth().signInWithOAuth).
  useEffect(() => {
    if (refCode) {
      localStorage.setItem("clarify_ref", refCode);
    }
  }, [refCode]);

  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [acceptTerms,  setAcceptTerms]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [done,         setDone]         = useState(false);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);

  // Strong password policy — all four must pass
  const pwChecks = useMemo(() => ({
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    number:  /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }), [password]);
  const pwValid = pwChecks.length && pwChecks.upper && pwChecks.number && pwChecks.special;

  const formValid = !!name.trim() && !!email.trim() && pwValid && acceptTerms;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pwValid) {
      setError("Password must be 8+ characters with an uppercase letter, a number, and a special character.");
      return;
    }
    if (!acceptTerms) {
      setError("You must accept the Terms and Privacy Policy to continue.");
      return;
    }

    setLoading(true);

    if (refCode) {
      localStorage.setItem("clarify_ref", refCode);
    }

    const { error: authError } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
      options: {
        data:            { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setDone(true);
  }

  // handleGoogle is retained to preserve refCode storage before OAuth redirect.
  // Actual sign-in uses OAuthButton components which call useAuth().signInWithOAuth.
  // This function is no longer called directly — refCode is stored on button click via OAuthButton onSuccess.

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

          {/* OAuth providers — all four required by manual: Google, GitHub, LinkedIn, Azure AD */}
          <div className="grid grid-cols-2 gap-2">
            <GoogleOAuthButton />
            <GithubOAuthButton />
            <LinkedInOAuthButton />
            <AzureOAuthButton />
          </div>

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
