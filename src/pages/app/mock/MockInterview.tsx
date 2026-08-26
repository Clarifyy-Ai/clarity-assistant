import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { getOrCreateSession } from "@/lib/session/sessionLifecycle";
import { toDbModel } from "@/lib/ai/modelMapping";
import { WARMUP_MAX } from "@/pages/app/mock/MockWarmup";
import { ClipboardList, Timer, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { handleSessionStartError } from "@/lib/billing/sessionStartErrors";
import { SessionTrustBanner } from "@/components/session/SessionTrustBanner";
import { PreSessionSetupWizard } from "@/components/session/PreSessionSetupWizard";
import type { QuestionDifficulty } from "@/lib/api/ai";
import type { LiveSessionConfig } from "@/types/session.types";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

const DIFFICULTY_LEVELS = [
  { value: "easy",   label: "Easy",   desc: "Warm-up, foundational" },
  { value: "medium", label: "Medium", desc: "Standard interview depth" },
  { value: "hard",   label: "Hard",   desc: "Senior / stretch questions" },
  { value: "mixed",  label: "Mixed",  desc: "Balanced mix of levels" },
] as const;

const QUESTION_COUNTS = [3, 5, 8, 10, 15];

export default function MockInterview() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [numQ, setNumQ] = useState(5);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>("medium");
  const [warmup, setWarmup] = useState(false);
  const [loading, setLoading] = useState(false);
  const startingRef = useRef(false);

  async function handleWizardStart(config: LiveSessionConfig) {
    if (startingRef.current || loading) return;
    if (!user?.id) {
      toast.error("Please sign in to start a mock session.");
      return;
    }
    if (!config.role?.trim()) {
      toast.message("Choose or type a target role so questions match the job.");
      return;
    }
    startingRef.current = true;
    setLoading(true);

    try {
      const merged = {
        ...config,
        type: config.interview_type,
        count: numQ,
        question_count: numQ,
        difficulty: config.difficulty ?? difficulty,
      };

      const { session, reused } = await getOrCreateSession({
        user_id:     user.id,
        type:        "mock",
        title:       merged.company
          ? `${warmup ? "Warmup" : "Mock"} — ${merged.company}`
          : warmup ? "Mock warmup" : "Mock interview",
        document_id: merged.resume_id ?? null,
        jd_id:       merged.jd_id ?? null,
        model_used:  toDbModel(merged.model) as any,
      });

      if (reused) toast.message("Resuming your in-progress session");

      try {
        sessionStorage.setItem(`clarify:mock-config:${session.id}`, JSON.stringify(merged));
      } catch {
        // The database session remains the source of truth if storage is unavailable.
      }

      navigate(
        warmup ? "/app/mock/warmup" : `/app/mock/session/${session.id}`,
        { state: { config: merged, sessionId: session.id } },
      );
    } catch (err: unknown) {
      if (handleSessionStartError(err)) return;
      const message = err instanceof Error ? err.message : "Failed to start session";
      toast.error(message);
    } finally {
      setLoading(false);
      startingRef.current = false;
    }
  }

  return (
    <div
      data-testid="page-width-root"
      className={cn(PAGE_SHELL, "space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200")}
    >
      <PageHeader
        title={PRODUCT_NAMES.mockInterview}
        description="Configure your practice session"
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.mockInterview },
        ]}
      />

      <SessionTrustBanner variant="mock" />

      <div
        data-testid="mock-free-banner"
        className="flex items-start gap-3 p-4 bg-emerald-100/80 dark:bg-emerald-500/15 border border-emerald-600/35 rounded-2xl min-w-0"
      >
        <ClipboardList className="w-4 h-4 text-emerald-800 dark:text-emerald-300 shrink-0 mt-0.5" />
        <p className="text-sm text-emerald-950 dark:text-emerald-100 min-w-0 break-words leading-relaxed">
          Mock sessions are <strong>free</strong> within your daily plan allowance. Each session runs for 5 minutes.
        </p>
      </div>

      <div data-testid="mock-session-options">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Mock session options</h3>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="w-3.5 h-3.5" aria-hidden="true" />
            5 min · Free
          </span>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Number of questions</p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumQ(n)}
                aria-pressed={numQ === n}
                disabled={loading}
                className={cn(
                  "min-w-[2.75rem] flex-1 py-2 rounded-lg border text-xs font-medium transition-all",
                  numQ === n
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Difficulty</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DIFFICULTY_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setDifficulty(level.value)}
                aria-pressed={difficulty === level.value}
                disabled={loading}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all",
                  difficulty === level.value
                    ? "bg-primary/10 border-primary/40"
                    : "bg-card border-border hover:border-primary/30",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-semibold",
                    difficulty === level.value ? "text-primary" : "text-foreground",
                  )}
                >
                  {level.label}
                </span>
                <span className="text-[10px] text-muted-foreground leading-snug">{level.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0" aria-hidden="true">
            <Wind className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Pre-session warmup</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              30s breathing exercise + {WARMUP_MAX} easy non-scored warmup questions
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWarmup((p) => !p)}
            role="switch"
            aria-checked={warmup}
            aria-label="Toggle pre-session warmup"
            disabled={loading}
            className={cn(
              "w-10 h-5 rounded-full border transition-all relative shrink-0",
              warmup
                ? "bg-primary border-primary/80"
                : "bg-secondary border-border",
            )}
          >
            <span className={cn(
              "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
              warmup ? "left-5" : "left-0.5",
            )} />
          </button>
        </div>
      </Card>
      </div>

      <PreSessionSetupWizard sessionType="mock" onStart={handleWizardStart} />
    </div>
  );
}
