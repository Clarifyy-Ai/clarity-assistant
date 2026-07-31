// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { useAuthStore } from "@/store/userStore";
import { getOrCreateSession, activateSession } from "@/lib/session/sessionLifecycle";
import { maxSessionSecondsForPlan, isFreePlan } from "@/lib/constants/freeTier";
import { toDbModel } from "@/lib/ai/modelMapping";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { Wind } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// MockWarmup — 30s breathing + WARMUP_MAX non-scored warmup questions
// ─────────────────────────────────────────────────────────────────

const WARMUP_QUESTIONS = [
  "What's your name and where are you based?",
  "What are you most excited to work on next?",
  "Tell me about a recent project you're proud of.",
  "What kind of team environment helps you do your best work?",
  "Describe a challenge you overcame in the last year.",
  "What skills are you actively improving right now?",
  "Why are you interested in this type of role?",
  "How do you prefer to receive feedback?",
  "What's one accomplishment you'd highlight from your resume?",
  "Where do you see yourself growing in the next 12 months?",
];

/** Number of easy non-scored warmup questions before a mock session. */
export const WARMUP_MAX = 10;

type Phase = "breathing" | "warmup" | "done";

export default function MockWarmup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuthStore();
  const prefersReducedMotion = usePrefersReducedMotion();
  const warmupMaxSeconds = maxSessionSecondsForPlan(profile?.plan_id);
  const warmupStartedRef = useRef<number | null>(null);

  const [phase,     setPhase]     = useState<Phase>("breathing");
  const [breathIdx, setBreathIdx] = useState(0);   // 0=inhale 1=hold 2=exhale
  const [breathPct, setBreathPct] = useState(0);
  const [qIdx,      setQIdx]      = useState(0);
  const [answer,    setAnswer]    = useState("");
  const [warmupSessionId, setWarmupSessionId] = useState<string | null>(
    ((location.state as { sessionId?: string } | null)?.sessionId) ?? null,
  );
  const [isPreparing, setIsPreparing] = useState(!warmupSessionId);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preparingRef = useRef(false);

  const BREATH_PHASES = [
    { label: "Inhale",  duration: 4, color: "emerald" },
    { label: "Hold",    duration: 4, color: "amber"   },
    { label: "Exhale",  duration: 4, color: "blue"    },
  ] as const;

  // ── Breathing cycle ───────────────────────────────────────────

  useEffect(() => {
    if (warmupSessionId || preparingRef.current) return;
    if (!user?.id) {
      toast.error("Please sign in to start a warmup.");
      navigate("/app/mock", { replace: true });
      return;
    }

    const config = (location.state as { config?: any } | null)?.config ?? {};
    preparingRef.current = true;
    setIsPreparing(true);
    getOrCreateSession({
      user_id: user.id,
      type: "warmup",
      title: config.company ? `Warmup — ${config.company}` : "Mock warmup",
      document_id: null,
      jd_id: config.jd_id ?? null,
      model_used: toDbModel(config.model ?? "gemini-2.0-flash") as any,
    }).then(async ({ session, reused }) => {
      setWarmupSessionId(session.id);
      await activateSession(session.id);
      if (reused) toast.message("Resuming your warmup");
    }).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to prepare warmup");
      navigate("/app/mock", { replace: true });
    }).finally(() => {
      preparingRef.current = false;
      setIsPreparing(false);
    });
  }, [warmupSessionId, user?.id, location.state, navigate]);

  useEffect(() => {
    if (!warmupSessionId || phase === "done") return;
    if (warmupStartedRef.current == null) {
      warmupStartedRef.current = Date.now();
    }
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (warmupStartedRef.current ?? Date.now())) / 1000);
      if (elapsed >= warmupMaxSeconds) {
        clearInterval(tick);
        toast.info(
          isFreePlan(profile?.plan_id)
            ? "Free plan limit: 5-minute warmup complete."
            : "Warmup time complete.",
        );
        setPhase("done");
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [warmupSessionId, phase, warmupMaxSeconds, profile?.plan_id]);

  useEffect(() => {
    if (phase !== "breathing") return;

    let elapsed = 0;
    const dur   = BREATH_PHASES[breathIdx].duration;

    timerRef.current = setInterval(() => {
      elapsed += 0.1;
      setBreathPct((elapsed / dur) * 100);

      if (elapsed >= dur) {
        clearInterval(timerRef.current!);
        const next = breathIdx + 1;

        if (next >= BREATH_PHASES.length) {
          // Done with one full cycle — move to warmup
          setTimeout(() => setPhase("warmup"), 300);
        } else {
          setBreathIdx(next);
          setBreathPct(0);
        }
      }
    }, 100);

    return () => clearInterval(timerRef.current!);
  }, [phase, breathIdx]);

  function warmupFeedback(text: string): { message: string; tone: "success" | "warning" | "info" } {
    const trimmed = text.trim();
    if (!trimmed) {
      return { message: "Try speaking a few sentences — even a rough answer helps warm up.", tone: "warning" };
    }
    if (trimmed.length < 40) {
      return { message: "Good start — expand with one concrete example next time.", tone: "info" };
    }
    return { message: "Nice warmup! Clear and confident — you're ready for the session.", tone: "success" };
  }

  function handleNextQuestion() {
    const feedback = warmupFeedback(answer);
    toast[feedback.tone](feedback.message);

    setAnswer("");
    if (qIdx + 1 >= WARMUP_MAX) {
      setPhase("done");
    } else {
      setQIdx((p) => p + 1);
    }
  }

  const currentBreath = BREATH_PHASES[breathIdx];

  return (
    <PageContent className="min-h-[calc(100vh-4rem)] flex flex-col px-4 py-6">
      <PageHeader
        title="Mock warmup"
        description={
          phase === "breathing"
            ? "Calm your nerves before the session"
            : phase === "warmup"
              ? "Practice a few easy questions"
              : "You're ready to begin"
        }
        breadcrumbs={[
          { label: "Mock Interview", href: "/app/mock" },
          { label: "Warmup" },
        ]}
      />

      {isPreparing && !warmupSessionId ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 max-w-lg mx-auto w-full">
          <SkeletonCard />
          <p className="text-sm text-muted-foreground">Preparing your warmup session…</p>
        </div>
      ) : (
      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-lg text-center">

        {/* ── Breathing phase ──────────────────────────── */}
        {phase === "breathing" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Let's calm your nerves
              </h2>
              <p className="text-muted-foreground text-sm">
                One breathing cycle before your session
              </p>
            </div>

            {/* Animated circle — note-only when reduced motion */}
            {prefersReducedMotion ? (
              <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-6 text-left space-y-3">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Wind className="w-4 h-4 text-primary" aria-hidden />
                  {currentBreath.label}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Step {breathIdx + 1} of 3 — follow the timer without the expanding circle.
                  Inhale through your nose, hold briefly, then exhale through your mouth.
                </p>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {Math.ceil(currentBreath.duration - (breathPct / 100) * currentBreath.duration)}s
                </p>
                <ProgressBar value={breathPct} max={100} color="violet" size="xs" />
              </div>
            ) : (
            <div className="relative w-40 h-40 mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80" cy="80" r="70"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="8"
                />
                <circle
                  cx="80" cy="80" r="70"
                  fill="none"
                  stroke={
                    currentBreath.color === "emerald" ? "#10b981" :
                    currentBreath.color === "amber"   ? "#f59e0b" : "#3b82f6"
                  }
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - breathPct / 100)}`}
                  className="transition-all duration-100"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className={cn(
                  "text-2xl font-black",
                  currentBreath.color === "emerald" ? "text-emerald-400" :
                  currentBreath.color === "amber"   ? "text-amber-400" : "text-blue-400"
                )}>
                  {currentBreath.label}
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  {Math.ceil(currentBreath.duration - (breathPct / 100) * currentBreath.duration)}s
                </p>
              </div>
            </div>
            )}

            <p className="text-xs text-muted-foreground">
              Breathe in through your nose, hold, breathe out through your mouth
            </p>
          </div>
        )}

        {/* ── Warmup questions ─────────────────────────── */}
        {phase === "warmup" && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Warmup question {qIdx + 1} of {WARMUP_MAX}
              </p>
              <ProgressBar
                value={qIdx + 1}
                max={WARMUP_MAX}
                color="violet"
                size="xs"
                className="mb-4"
              />
              <h2 className="text-xl font-bold text-foreground">
                {WARMUP_QUESTIONS[qIdx]}
              </h2>
              <p className="text-xs text-muted-foreground mt-2">
                No score — just warm up your voice
              </p>
            </div>

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type or just speak naturally…"
              rows={4}
              className="w-full bg-accent/5 border border-border text-foreground placeholder:text-muted-foreground rounded-2xl px-4 py-3 resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors text-sm"
            />

            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={handleNextQuestion}
            >
              {qIdx + 1 < WARMUP_MAX ? "Next question →" : "Start session →"}
            </Button>
          </div>
        )}

        {/* ── Done — transition ─────────────────────────── */}
        {phase === "done" && (
          <div className="space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Wind className="w-7 h-7 text-primary" aria-hidden />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">You&apos;re warmed up!</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Your voice is ready. The real questions start now.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                const sid =
                  warmupSessionId ??
                  (location.state as { sessionId?: string } | null)?.sessionId;
                navigate(
                  sid ? `/app/mock/session/${sid}` : "/app/mock",
                  { state: location.state },
                );
              }}
            >
              Begin Session →
            </Button>
          </div>
        )}
      </div>
      </div>
      )}
    </PageContent>
  );
}
