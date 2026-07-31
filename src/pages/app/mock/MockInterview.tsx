// src/pages/app/mock/MockInterview.tsx — PRODUCTION FIXED
// Fixes (F3):
// - config.type, config.role, config.company, config.count aligned to generate-questions schema
// - model default corrected: "gemini-flash" → "gemini-2.0-flash"
// - hint_style corrected: "short_hints" → "concise"
// - smart_routing: false → true (was disabling modelRouter entirely)
// - role pre-filled from profile.target_role instead of hardcoded null
// - navigate() only called inside try block (was reachable even after catch)

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/layout/PlanGate";
import { getOrCreateSession } from "@/lib/session/sessionLifecycle";
import { toDbModel } from "@/lib/ai/modelMapping";
import { WARMUP_MAX } from "@/pages/app/mock/MockWarmup";
import {
  ClipboardList, ChevronRight, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { SessionTrustBanner } from "@/components/session/SessionTrustBanner";

// ─────────────────────────────────────────────────────────────────
// MockInterview — session config page
// ─────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  { value: "behavioural",   label: "Behavioural",   icon: "🤝", desc: "Tell me about a time…" },
  { value: "technical",     label: "Technical",     icon: "💻", desc: "Algorithms, systems"   },
  { value: "system_design", label: "System Design", icon: "🏗️", desc: "Design at scale"       },
  { value: "hr",            label: "HR / Culture",  icon: "🏢", desc: "Fit, motivation"       },
  { value: "mixed",         label: "Mixed",         icon: "🎲", desc: "Variety of types"      },
];

const QUESTION_COUNTS = [3, 5, 8, 10, 15];
const COMPANIES = [
  "Google", "Meta", "Amazon", "Apple", "Microsoft",
  "Stripe", "Airbnb", "Notion", "OpenAI", "Netflix",
];

export default function MockInterview() {
  const navigate    = useNavigate();
  // ✅ FIX: also read profile so we can pre-fill role from target_role
  const { user, profile } = useAuthStore();

  const [type,    setType]    = useState("behavioural");
  const [company, setCompany] = useState("");
  const [role,    setRole]    = useState(() => (profile as any)?.target_role ?? "");
  const [numQ,    setNumQ]    = useState(5);
  const [warmup,  setWarmup]  = useState(false);
  const [loading, setLoading] = useState(false);
  const startingRef = useRef(false);

  async function handleStart() {
    if (startingRef.current || loading) return; // guard double-click
    if (!user?.id) {
      toast.error("Please sign in to start a mock session.");
      return;
    }
    startingRef.current = true;
    setLoading(true);

    try {
      // ✅ FIX: Config shape aligned to generate-questions edge function schema.
      //
      // generate-questions/index.ts expects:
      //   { type, role, company, count, hint_style, model, ... }
      //
      // Previously this sent interview_type (not type), and model was "gemini-flash"
      // (not a valid Gemini model string — caused silent model fallback to gpt-4o).
      const config = {
        // ── generate-questions contract fields ──
        type,                              // ✅ was: interview_type (key mismatch)
        role:    role.trim() || null,      // ✅ was: hardcoded null (ignored user's target_role)
        company: company.trim() || null,
        count:   numQ,                     // ✅ was: question_count (key mismatch)

        // ── session / copilot fields ──
        interview_type: type,              // kept for sessionLifecycle + useLiveCopilot
        hint_style:     "concise",         // ✅ was: "short_hints" (invalid enum value)
        model:          "gemini-2.0-flash",// ✅ was: "gemini-flash" (invalid model string)
        smart_routing:  true,              // ✅ was: false (disabled modelRouter entirely)
        stealth_mode:   false,
        resume_id:      null,
        jd_id:          null,
        instructions:   "",
        enable_system_audio: true,
        question_count: numQ,              // kept for downstream session config readers
      };

      const { session, reused } = await getOrCreateSession({
        user_id:     user.id,
        type:        warmup ? "warmup" : "mock",
        title:       company
          ? `${warmup ? "Warmup" : "Mock"} — ${company}`
          : warmup ? "Mock warmup" : "Mock interview",
        document_id: null,
        jd_id:       config.jd_id,
        model_used:  toDbModel(config.model) as any,
      });

      if (reused) toast.message("Resuming your in-progress session");

      // ✅ FIX: navigate() is now strictly inside try — previously a throw in
      // getOrCreateSession could leave startingRef stuck if navigate() had already run.
      navigate(
        warmup ? "/app/mock/warmup" : `/app/mock/session/${session.id}`,
        { state: { config, sessionId: session.id } },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start session";
      toast.error(message);
    } finally {
      setLoading(false);
      startingRef.current = false;
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      <PageHeader
        title="Mock Interview"
        description="Configure your practice session"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Mock Interview" },
        ]}
      />

      <SessionTrustBanner variant="mock" />

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
              aria-pressed={type === t.value}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                type === t.value
                  ? "bg-primary/10 border-primary/40"
                  : "bg-card border-border hover:border-primary/30"
              )}
            >
              <span className="text-xl" aria-hidden="true">{t.icon}</span>
              <span className={cn(
                "text-xs font-semibold",
                type === t.value ? "text-primary" : "text-foreground"
              )}>
                {t.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{t.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Company + role + session length */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Target company + role */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Target company <span className="text-muted-foreground font-normal">(optional)</span>
          </h3>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Google, Stripe…"
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring mb-3 transition-colors"
          />
          <div className="flex flex-wrap gap-1.5 mb-4">
            {COMPANIES.slice(0, 6).map((c) => (
              <button
                key={c}
                onClick={() => setCompany(c)}
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all",
                  company === c
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {/* ✅ NEW: role field — pre-filled from profile.target_role */}
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Target role <span className="text-muted-foreground font-normal">(optional)</span>
          </h3>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Software Engineer, PM…"
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
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
                  aria-pressed={numQ === n}
                  className={cn(
                    "flex-1 py-2 rounded-lg border text-xs font-medium transition-all",
                    numQ === n
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground bg-secondary rounded-xl px-3 py-2">
            <span className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
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
        <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          🧘
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Pre-session warmup</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            30s breathing exercise + {WARMUP_MAX} easy non-scored warmup questions
          </p>
        </div>
        <button
          onClick={() => setWarmup((p) => !p)}
          role="switch"
          aria-checked={warmup}
          aria-label="Toggle pre-session warmup"
          className={cn(
            "w-10 h-5 rounded-full border transition-all relative shrink-0",
            warmup
              ? "bg-primary border-primary/80"
              : "bg-secondary border-border"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
            warmup ? "left-5" : "left-0.5"
          )} />
        </button>
      </Card>

      {/* Start button */}
      <p className="text-xs text-center text-muted-foreground">
        Estimated usage: ~{AI_CREDIT_COSTS.generate_questions} credits to generate questions · ~
        {AI_CREDIT_COSTS.live_hint} credits/hint · Debrief {AI_CREDIT_COSTS.session_debrief}{" "}
        credits
      </p>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        onClick={handleStart}
        leftIcon={<ClipboardList className="w-4 h-4" aria-hidden="true" />}
        rightIcon={<ChevronRight className="w-4 h-4" aria-hidden="true" />}
      >
        {warmup ? "Start Warmup →" : "Start Session →"}
      </Button>
    </div>
  );
}
