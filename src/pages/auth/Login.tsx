import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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
import { Eye, EyeOff, AlertCircle, Sparkles, TrendingUp, Users } from "lucide-react";

const TESTIMONIAL = {
  quote: "Clarify AI helped me land offers at 3 FAANG companies. The mock interviews are incredibly realistic.",
  author: "Sarah K.",
  role: "Senior Engineer at Google",
};

export default function Login() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const from       = (location.state as any)?.from?.pathname ?? "/app";

  // Redirect if already authenticated
  const authStatus = useAuthStore((s) => s.status);
  useEffect(() => {
    if (authStatus === "authenticated") {
      navigate(from, { replace: true });
    }
  }, [authStatus, from, navigate]);

  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // forces re-render for countdown

  // ── Brute-force lockout: 5 failed attempts → 30 min cooldown ───
  const LOCK_KEY = "clarify_login_lock";
  const ATTEMPT_KEY = "clarify_login_attempts";
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 30 * 60 * 1000;

  // Restore lockout state on mount
  useEffect(() => {
    const stored = localStorage.getItem(LOCK_KEY);
    if (stored) {
      const until = parseInt(stored, 10);
      if (!isNaN(until) && until > Date.now()) {
        setLockedUntil(until);
      } else {
        localStorage.removeItem(LOCK_KEY);
        localStorage.removeItem(ATTEMPT_KEY);
      }
    }
  }, []);

  // Tick every second while locked to update countdown
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        localStorage.removeItem(LOCK_KEY);
        localStorage.removeItem(ATTEMPT_KEY);
      } else {
        setTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = !!lockedUntil && lockedUntil > Date.now();
  const lockMinsLeft = isLocked ? Math.ceil((lockedUntil! - Date.now()) / 60000) : 0;
  void tick; // referenced to keep eslint happy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      // Increment failed-attempt counter
      const prev = parseInt(localStorage.getItem(ATTEMPT_KEY) || "0", 10) || 0;
      const next = prev + 1;
      localStorage.setItem(ATTEMPT_KEY, String(next));

      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCK_DURATION_MS;
        localStorage.setItem(LOCK_KEY, String(until));
        setLockedUntil(until);
        setError(`Too many failed attempts. Account locked for 30 minutes.`);
      } else {
        const remaining = MAX_ATTEMPTS - next;
        setError(`${authError.message} (${remaining} attempt${remaining === 1 ? "" : "s"} remaining)`);
      }
    } else {
      // Successful login → clear counters
      localStorage.removeItem(ATTEMPT_KEY);
      localStorage.removeItem(LOCK_KEY);
      navigate(from, { replace: true });
    }
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
              AI-powered interview coaching
            </div>
            <h2 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
              Land your dream
              <br />
              <span className="text-indigo-200">tech role</span>
            </h2>
            <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
              Practice with AI that thinks like a real interviewer. Get instant feedback, improve faster.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mt-10">
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-indigo-200" />
                  <span className="text-white font-black text-2xl">87%</span>
                </div>
                <p className="text-indigo-200 text-xs">of users get interviews within 60 days</p>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-indigo-200" />
                  <span className="text-white font-black text-2xl">50k+</span>
                </div>
                <p className="text-indigo-200 text-xs">engineers trained</p>
              </div>
            </div>
          </div>

          {/* Testimonial */}
          <div className="bg-white/10 border border-white/15 rounded-2xl p-5 backdrop-blur-sm">
            <p className="text-white text-sm leading-relaxed italic">
              "{TESTIMONIAL.quote}"
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-400/40 flex items-center justify-center text-white text-xs font-bold">
                {TESTIMONIAL.author[0]}
              </div>
              <div>
                <p className="text-white text-xs font-semibold">{TESTIMONIAL.author}</p>
                <p className="text-indigo-200 text-[11px]">{TESTIMONIAL.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex flex-col items-center gap-3">
          <div className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center gap-2">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-7 w-auto brightness-0 invert" />
            <span className="text-lg font-bold text-white">Clarify AI</span>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your account to continue</p>
          </div>

          {/* OAuth providers — all four required by manual: Google, GitHub, LinkedIn, Azure AD */}
          <div className="grid grid-cols-2 gap-2">
            <GoogleOAuthButton />
            <GithubOAuthButton />
            <LinkedInOAuthButton />
            <AzureOAuthButton />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or sign in with email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <div className="space-y-1">
              <Input
                label="Password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
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
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:opacity-80 transition-opacity"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              fullWidth
            >
              Sign in
            </Button>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-primary font-medium hover:opacity-80 transition-opacity"
            >
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
