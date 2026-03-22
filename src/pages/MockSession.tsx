// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useAuth } from "@/hooks/useAuth";
import { useOverlayStore } from "@/store/overlayStore";
import { composeHint } from "@/lib/overlay/overlayCompositor";
import {
  ChevronRight, ChevronLeft, Square, Loader2,
  Lightbulb, RefreshCw, Clock, CreditCard,
  CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionConfig } from "@/types/session.types";

// ─────────────────────────────────────────────────────────────────
// MockSession
// Full mock interview experience:
//   Setup wizard → live Q&A with streaming hints → completion
// ─────────────────────────────────────────────────────────────────

type SessionPhase = "setup" | "in_progress" | "completed";

export default function MockSession() {
  const navigate                 = useNavigate();
  const [searchParams]           = useSearchParams();
  const { profile, canAccessFeature } = useAuth();
  const orchestrator             = useSessionOrchestrator();
  const hint_state               = useOverlayStore((s) => s.hint_state);
  const current_hint_text        = useOverlayStore((s) => s.current_hint);
  const [phase, setPhase]        = useState<SessionPhase>("setup");
  const [config, setConfig]      = useState<Partial<SessionConfig>>({
    interview_type:   "behavioral",
    experience_level: profile?.experience_level ?? "mid",
    question_count:   5,
    difficulty:       "medium",
  });

  const hintContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll hint on new content
  useEffect(() => {
    if (hintContainerRef.current) {
      hintContainerRef.current.scrollTop = hintContainerRef.current.scrollHeight;
    }
  }, [current_hint_text]);

  // ── Start session ─────────────────────────────────────────────

  async function handleStart() {
    if (!config.interview_type) return;
    setPhase("in_progress");
    await orchestrator.initSession(config as SessionConfig);
  }

  // ── Complete session ──────────────────────────────────────────

  async function handleComplete() {
    setPhase("completed");
    await orchestrator.completeSession();
  }

  // ── Phase: Setup ──────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white">Mock Interview Setup</h1>
            <p className="text-gray-400 mt-2">Configure your practice session</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">

            {/* Interview type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Interview Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {INTERVIEW_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setConfig((c) => ({ ...c, interview_type: type.value as any }))}
                    className={cn(
                      "p-3 rounded-xl border text-sm font-medium transition-all",
                      config.interview_type === type.value
                        ? "bg-violet-600/30 border-violet-500 text-violet-200"
                        : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                    )}
                  >
                    {type.icon} {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience level */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Experience Level
              </label>
              <select
                value={config.experience_level}
                onChange={(e) => setConfig((c) => ({ ...c, experience_level: e.target.value as any }))}
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500"
              >
                <option value="entry">Entry Level (0-2 yrs)</option>
                <option value="mid">Mid Level (3-5 yrs)</option>
                <option value="senior">Senior (6-10 yrs)</option>
                <option value="lead">Lead / Principal (10+ yrs)</option>
              </select>
            </div>

            {/* Question count + difficulty row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Questions
                </label>
                <select
                  value={config.question_count}
                  onChange={(e) => setConfig((c) => ({ ...c, question_count: Number(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500"
                >
                  {[3, 5, 8, 10].map((n) => (
                    <option key={n} value={n}>{n} questions</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Difficulty
                </label>
                <select
                  value={config.difficulty}
                  onChange={(e) => setConfig((c) => ({ ...c, difficulty: e.target.value as any }))}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
            </div>

            {/* Optional: company + role */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  value={config.company ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, company: e.target.value }))}
                  placeholder="e.g. Google"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Role <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  value={config.role ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, role: e.target.value }))}
                  placeholder="e.g. SWE"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {/* Credits notice */}
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 rounded-lg p-3">
              <CreditCard className="w-3.5 h-3.5 shrink-0" />
              <span>
                Uses ~{config.question_count ?? 5} credits for AI hints.
                You have{" "}
                <strong className="text-white">{profile?.credits_remaining ?? 0}</strong> remaining.
              </span>
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={!config.interview_type}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
          >
            Start Session
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: In progress ────────────────────────────────────────

  if (phase === "in_progress") {
    const currentQ    = orchestrator.currentQuestion;
    const isLoading   = hint_state === "generating";
    const hintText    = current_hint_text;
    const composed    = hintText
      ? composeHint(hintText, profile?.hint_style ?? "short_hints")
      : null;

    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

          {/* Progress bar */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{
                  width: `${((orchestrator.currentIndex + 1) / Math.max(1, orchestrator.totalQuestions)) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm text-gray-400 shrink-0">
              {orchestrator.currentIndex + 1} / {orchestrator.totalQuestions}
            </span>
            <ElapsedTimer seconds={orchestrator.elapsedSeconds} />
          </div>

          {/* Question card */}
          {orchestrator.status === "setting_up" ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-gray-400">Generating your questions…</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-xs text-violet-400 font-medium uppercase tracking-wider mb-3">
                Question {orchestrator.currentIndex + 1}
              </p>
              <p className="text-xl font-medium text-white leading-relaxed">
                {currentQ?.question_text ?? "Loading…"}
              </p>
            </div>
          )}

          {/* AI Hint panel */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-white">AI Hint</span>
              </div>
              <div className="flex items-center gap-2">
                {isLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-violet-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating
                  </div>
                )}
                {!isLoading && hintText && (
                  <button
                    onClick={() => orchestrator.requestHint(currentQ?.question_text ?? "")}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
              </div>
            </div>

            <div
              ref={hintContainerRef}
              className="px-5 py-4 min-h-[120px] max-h-[320px] overflow-y-auto"
            >
              {!hintText && !isLoading && (
                <p className="text-gray-500 text-sm italic">
                  Click "Get Hint" to receive AI coaching for this question.
                </p>
              )}
              {hintText && (
                <HintDisplay composed={composed} hintStyle={profile?.hint_style ?? "short_hints"} />
              )}
              {isLoading && !hintText && (
                <HintSkeleton />
              )}
            </div>

            {!isLoading && !hintText && (
              <div className="px-5 pb-4">
                <button
                  onClick={() => orchestrator.requestHint(currentQ?.question_text ?? "")}
                  disabled={!currentQ}
                  className="w-full py-2.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-300 text-sm font-medium rounded-xl transition-all"
                >
                  Get AI Hint
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => orchestrator.nextQuestion()}
              disabled={orchestrator.currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center gap-3">
              {orchestrator.currentIndex < orchestrator.totalQuestions - 1 ? (
                <button
                  onClick={() => orchestrator.nextQuestion()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl transition-all"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl transition-all"
                >
                  <CheckCircle className="w-4 h-4" />
                  Finish Session
                </button>
              )}

              <button
                onClick={handleComplete}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-xl transition-all"
              >
                <Square className="w-3.5 h-3.5" />
                End
              </button>
            </div>
          </div>

          {/* Credits used */}
          <div className="flex justify-center">
            <span className="text-xs text-gray-500">
              {orchestrator.creditsConsumed} credits used this session
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase: Completed (redirect handled by orchestrator) ───────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto" />
        <p className="text-gray-400">Generating your scorecard…</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function HintDisplay({ composed, hintStyle }: { composed: any; hintStyle: string }) {
  if (!composed) return null;
  return (
    <div className="space-y-1.5 text-sm text-gray-200">
      {composed.lines.map((line: any, i: number) => {
        if (line.type === "blank") return <div key={i} className="h-2" />;
        if (line.type === "header") return (
          <p key={i} className="font-semibold text-white text-base">{line.content}</p>
        );
        if (line.type === "code") return (
          <code key={i} className="block bg-black/40 rounded px-2 py-1 text-xs font-mono text-green-300">
            {line.content}
          </code>
        );
        if (line.type === "bullet") return (
          <div key={i} className="flex gap-2" style={{ paddingLeft: `${line.indent * 12}px` }}>
            <span className="text-violet-400 mt-0.5">•</span>
            <span>{line.content}</span>
          </div>
        );
        if (line.type === "keyword") return (
          <span key={i} className="inline-block px-2 py-0.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 rounded text-xs mr-1">
            {line.content}
          </span>
        );
        return (
          <p key={i} className={cn(line.bold && "font-semibold text-white")}>
            {line.content}
          </p>
        );
      })}
    </div>
  );
}

function HintSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-4 bg-white/10 rounded w-full" />
      <div className="h-4 bg-white/10 rounded w-5/6" />
      <div className="h-4 bg-white/10 rounded w-2/3" />
    </div>
  );
}

function ElapsedTimer({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400">
      <Clock className="w-3 h-3" />
      {m}:{s}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  { value: "behavioral",  label: "Behavioural",  icon: "🧠" },
  { value: "technical",   label: "Technical",    icon: "💻" },
  { value: "system_design", label: "System Design", icon: "🏗️" },
  { value: "coding",      label: "Coding",       icon: "⌨️" },
  { value: "hr",          label: "HR",           icon: "👥" },
  { value: "case",        label: "Case Study",   icon: "📋" },
];
