// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PlanGate } from "@/components/layout/PlanGate";
import {
  ClipboardList, ChevronRight, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// MockInterview — session config page
// ─────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  { value: "behavioural",    label: "Behavioural",    icon: "🤝", desc: "Tell me about a time…" },
  { value: "technical",      label: "Technical",      icon: "💻", desc: "Algorithms, systems"   },
  { value: "system_design",  label: "System Design",  icon: "🏗️", desc: "Design at scale"       },
  { value: "hr",             label: "HR / Culture",   icon: "🏢", desc: "Fit, motivation"       },
  { value: "mixed",          label: "Mixed",          icon: "🎲", desc: "Variety of types"      },
];

const QUESTION_COUNTS = [3, 5, 8, 10, 15];
const COMPANIES = [
  "Google", "Meta", "Amazon", "Apple", "Microsoft",
  "Stripe", "Airbnb", "Notion", "OpenAI", "Netflix",
];

export default function MockInterview() {
  const navigate    = useNavigate();
  const credits     = useCredits();
  const orchestrator = useSessionOrchestrator();

  const [type,       setType]       = useState("behavioural");
  const [company,    setCompany]    = useState("");
  const [numQ,       setNumQ]       = useState(5);
  const [warmup,     setWarmup]     = useState(true);
  const [loading,    setLoading]    = useState(false);

  const totalCost = 0;

  async function handleStart() {
    setLoading(true);
    await orchestrator.createSession({
      session_type:     "mock",
      interview_type:   type,
      target_company:   company || null,
      question_count:   numQ,
    });
    setLoading(false);

    if (warmup) {
      navigate("/app/mock/warmup");
    } else {
      navigate("/app/mock/session");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Mock Interview"
        subtitle="Configure your practice session"
      />

      {/* Mock sessions are free */}
      <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
        <ClipboardList className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-300">
          Mock sessions are <strong>free</strong> — practice as much as you like. Each session runs for 5 minutes.
        </p>
      </div>

      {/* Interview type */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Interview type</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {INTERVIEW_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                type === t.value
                  ? "bg-violet-600/20 border-violet-500/40"
                  : "bg-white/3 border-white/10 hover:border-white/20"
              )}
            >
              <span className="text-xl">{t.icon}</span>
              <span className={cn(
                "text-xs font-semibold",
                type === t.value ? "text-violet-200" : "text-foreground"
              )}>
                {t.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{t.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Company + session length */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Target company */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Target company <span className="text-muted-foreground font-normal">(optional)</span>
          </h3>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Google, Stripe…"
            className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 mb-3"
          />
          <div className="flex flex-wrap gap-1.5">
            {COMPANIES.slice(0, 6).map((c) => (
              <button
                key={c}
                onClick={() => setCompany(c)}
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all",
                  company === c
                    ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                    : "bg-white/3 border-white/10 text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Card>

        {/* Questions + time */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Session length</h3>

          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Number of questions</p>
            <div className="flex gap-2">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNumQ(n)}
                  className={cn(
                    "flex-1 py-2 rounded-lg border text-xs font-medium transition-all",
                    numQ === n
                      ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                      : "bg-white/3 border-white/10 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground bg-white/3 rounded-xl px-3 py-2">
            <span className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" />
              5 min session
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              Free
            </span>
          </div>
        </Card>
      </div>

      {/* Warmup toggle */}
      <Card className="flex items-center gap-4">
        <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center text-lg shrink-0">
          🧘
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Pre-session warmup</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            30s breathing exercise + 2 easy non-scored warmup questions
          </p>
        </div>
        <button
          onClick={() => setWarmup((p) => !p)}
          className={cn(
            "w-10 h-5 rounded-full border transition-all relative shrink-0",
            warmup
              ? "bg-violet-600 border-violet-500"
              : "bg-accent/10 border-white/20"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
            warmup ? "left-5" : "left-0.5"
          )} />
        </button>
      </Card>

      {/* Start button */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        onClick={handleStart}
        leftIcon={<ClipboardList className="w-4 h-4" />}
        rightIcon={<ChevronRight className="w-4 h-4" />}
      >
        {warmup ? "Start Warmup →" : "Start Session →"}
      </Button>
    </div>
  );
}
