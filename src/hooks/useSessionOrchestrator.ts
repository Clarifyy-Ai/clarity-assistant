// src/pages/app/mock/MockSession.tsx
// Mock interview session — end-to-end wired.
//
// Data flow:
//   1. handleSetup → creates sessions row → calls generate-questions EF
//                  → orchestrator.setQuestions(questions) → "active" phase
//   2. Per question: captureAnswer() snapshots transcript + metrics into answersRef
//   3. handleEndSession / handleNextQuestion (last Q) →
//        persistMockSession() → updates sessions + inserts session_answers
//                                + session_transcripts + session_ai_interactions
//        → navigate to /app/sessions/:id (scorecard)
//
// Stale closure fix:
//   handleEndSession is memoised with useCallback and synced into
//   handleEndSessionRef so the timer setInterval always calls the latest version.
//
// @ts-nocheck REMOVED — all types are explicit below.

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useFillerWordDetection } from "@/hooks/useFillerWordDetection";
import { useWPMTracker } from "@/hooks/useWPMTracker";
import { useSentimentAnalysis } from "@/hooks/useSentimentAnalysis";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAuthStore } from "@/store/authStore";          // FIX: was @/store/userStore
import { useAudioStore } from "@/store/audioStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { PreSessionSetup } from "@/components/session/PreSessionSetup";
import { sessionsDB } from "@/lib/supabase/database";
import { supabase } from "@/lib/supabase/client";
import { EDGE_BASE } from "@/lib/env";
import { getAuthHeaders } from "@/lib/network/fetchEdge";
import { toDbModel } from "@/lib/ai/modelMapping";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  Mic, MicOff, Square, ChevronRight,
  SkipForward, Eye, EyeOff, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LiveSessionConfig } from "@/types/session.types";

/* ─── TYPES ──────────────────────────────────────────────────────────────── */

export interface GeneratedQuestion {
  question_text:    string;
  category?:        string;
  difficulty?:      "easy" | "medium" | "hard";
  follow_up_hints?: string[];
}

/** One record per question — inserted into session_answers on completion */
interface QuestionAnswer {
  question_index: number;
  question_text:  string;
  answer_text:    string;
  duration_ms:    number;
  filler_count:   number;
  avg_wpm:        number;
  skipped:        boolean;
  answered_at:    string;
}

/* ─── CONSTANTS ──────────────────────────────────────────────────────────── */

const SESSION_DURATION_S    = 5 * 60;   // 5-minute session
const DEFAULT_QUESTION_COUNT = 5;

/* ─── HELPERS ────────────────────────────────────────────────────────────── */

/**
 * Calls the generate-questions Edge Function.
 * Returns questions tailored to the interview type, resume, and JD.
 * Throws on network error or empty response so handleSetup can surface it.
 */
async function fetchQuestionsFromEF(
  config: LiveSessionConfig,
  count:  number,
): Promise<GeneratedQuestion[]> {
  const headers  = await getAuthHeaders();
  const response = await fetch(`${EDGE_BASE}/generate-questions`, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify({
      interview_type: config.interview_type,
      resume_id:      config.resume_id   ?? null,
      jd_id:          config.jd_id       ?? null,
      question_count: count,
      model:          config.model,
      hint_style:     config.hint_style,
    }),
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
    throw new Error(body.error ?? `generate-questions failed: ${response.status}`);
  }

  const data = await response.json() as { questions?: GeneratedQuestion[] };
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("generate-questions returned no questions");
  }
  return data.questions;
}

/**
 * Calculates an overall session score (0–100):
 *   30 pts — completion rate (questions answered vs total)
 *   30 pts — answer content depth (avg word count; 150 words = full marks)
 *   20 pts — speaking pace (100–160 WPM = ideal)
 *   20 pts — filler word rate (–2 pts per filler per question)
 */
function calculateOverallScore(
  answers:        QuestionAnswer[],
  avgWpm:         number,
  totalFillers:   number,
  totalQuestions: number,
): number {
  if (answers.length === 0) return 0;

  const answeredCount   = answers.filter((a) => !a.skipped).length;
  const completionScore = (answeredCount / Math.max(totalQuestions, 1)) * 30;

  const avgWords = answers
    .filter((a) => !a.skipped)
    .reduce((sum, a) => sum + a.answer_text.split(/\s+/).filter(Boolean).length, 0) /
    Math.max(answeredCount, 1);
  const contentScore = Math.min(avgWords / 150 * 30, 30);

  const wpmScore =
    avgWpm >= 100 && avgWpm <= 160 ? 20 :
    avgWpm >= 80  && avgWpm < 100  ? 15 :
    avgWpm > 160  && avgWpm <= 180 ? 15 : 10;

  const fillerRate  = totalFillers / Math.max(answeredCount, 1);
  const fillerScore = Math.max(0, 20 - fillerRate * 2);

  return Math.round(Math.min(100, completionScore + contentScore + wpmScore + fillerScore));
}

/* ─── COMPONENT ──────────────────────────────────────────────────────────── */

export default function MockSession() {
  const navigate      = useNavigate();
  const { profile }   = useAuthStore();
  const orchestrator  = useSessionOrchestrator();
  const stt           = useSpeechRecognition();
  const fillerHook    = useFillerWordDetection(stt.interimTranscript);
  const wpmHook       = useWPMTracker(stt.transcript);
  // sentimentHook available for future scoring dimensions
  useSentimentAnalysis(stt.transcript);

  const startTimeRef      = useRef<string>(new Date().toISOString());
  const questionStartRef  = useRef<number>(Date.now());    // ms timestamp for per-Q duration
  const answersRef        = useRef<QuestionAnswer[]>([]);  // accumulated before persist
  const prevTranscriptRef = useRef<number>(0);
  const endCalledRef      = useRef<boolean>(false);        // prevents double-end race

  // FIX: ref keeps the timer callback pointing at the latest handleEndSession
  const handleEndSessionRef = useRef<() => Promise<void>>();

  const [phase,        setPhase]       = useState<"setup" | "loading" | "active">("setup");
  const [panicMode,    setPanicMode]   = useState(false);
  const [skipConfirm,  setSkipConfirm] = useState(false);
  const [endConfirm,   setEndConfirm]  = useState(false);

  const sessionConfigRef = useRef<LiveSessionConfig | null>(null);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_DURATION_S);
  const sessionTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── OVERLAY ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase === "active") useOverlayStore.getState().showOverlay();
    return () => useOverlayStore.getState().hideOverlay();
  }, [phase]);

  /* ── TIMER ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "active") return;
    sessionTimerRef.current = setInterval(() => {
      setSessionTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(sessionTimerRef.current!);
          // FIX: use ref so timer always calls the latest (non-stale) handler
          void handleEndSessionRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [phase]);

  /* ── RESET ON QUESTION CHANGE ─────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "active") return;
    stt.resetTranscript();
    fillerHook.reset();
    wpmHook.reset();
    questionStartRef.current  = Date.now();
    prevTranscriptRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator.currentQuestionIndex]);

  /* ── HOTKEYS ──────────────────────────────────────────────────────────── */

  useHotkeys([
    {
      keys:    "ctrl+shift+h",
      handler: () => {
        const o = useOverlayStore.getState();
        o.is_visible ? o.hideOverlay() : o.showOverlay();
      },
    },
    { keys: "ctrl+shift+p", handler: () => setPanicMode((p) => !p) },
    { keys: "ctrl+shift+s", handler: () => stt.toggleMute() },
    { keys: "ctrl+shift+n", handler: () => setSkipConfirm(true) },
  ]);

  /* ── DERIVED STATE ────────────────────────────────────────────────────── */

  const question     = orchestrator.currentQuestion as GeneratedQuestion | string | null;
  const qIndex       = orchestrator.currentQuestionIndex ?? 0;
  const totalQ       = orchestrator.totalQuestions ?? DEFAULT_QUESTION_COUNT;
  const isLastQ      = qIndex >= totalQ - 1;
  const questionText = question
    ? typeof question === "string"
      ? question
      : (question as GeneratedQuestion).question_text ?? ""
    : "";

  const timeColor =
    sessionTimeLeft > 120 ? "emerald" :
    sessionTimeLeft > 30  ? "amber"   : "red";

  /* ── AUTO-HINT ON QUESTION CHANGE ─────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "active" || !questionText) return;
    prevTranscriptRef.current = 0;
    useOverlayStore.getState().setCurrentQuestion(questionText);
    if (useOverlayStore.getState().auto_generate) {
      void handleRequestHint();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionText]);

  /* ── STT → AUDIO STORE ────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "active" || !stt.transcript) return;
    const full = stt.transcript.trim();
    if (!full || full.length <= prevTranscriptRef.current) return;
    const delta = full.slice(prevTranscriptRef.current).trim();
    prevTranscriptRef.current = full.length;
    if (!delta) return;
    const now = Date.now();
    useAudioStore.getState().addUtterance({
      id:                      `mock-${now}`,
      text:                    delta,
      speaker:                 "candidate",   // FIX: was "user", must match Speaker type
      words:                   [],
      start_ms:                now,
      end_ms:                  now,
      is_final:                true,
      is_interviewer_question: false,
      confidence:              1.0,
    });
  }, [phase, stt.transcript]);

  useEffect(() => {
    if (phase !== "active" || !stt.interimTranscript) return;
    useAudioStore.getState().updateInterimText(stt.interimTranscript);
  }, [phase, stt.interimTranscript]);

  /* ── CAPTURE ANSWER ───────────────────────────────────────────────────── */

  /**
   * Snapshots the current question's answer into answersRef before
   * advancing to the next question or ending the session.
   * Must be called BEFORE stt.resetTranscript() or orchestrator.nextQuestion().
   */
  const captureAnswer = useCallback((skipped = false) => {
    if (!questionText) return;
    const answer: QuestionAnswer = {
      question_index: qIndex,
      question_text:  questionText,
      answer_text:    stt.transcript?.trim() ?? "",
      duration_ms:    Date.now() - questionStartRef.current,
      filler_count:   fillerHook.totalCount,
      avg_wpm:        wpmHook.wpm,
      skipped,
      answered_at:    new Date().toISOString(),
    };
    // Deduplicate by question_index in case of rapid double-fire
    answersRef.current = [
      ...answersRef.current.filter((a) => a.question_index !== qIndex),
      answer,
    ];
  }, [qIndex, questionText, stt.transcript, fillerHook.totalCount, wpmHook.wpm]);

  /* ── PERSIST ──────────────────────────────────────────────────────────── */

  const persistMockSession = useCallback(async () => {
    const session   = useSessionStore.getState();
    const overlay   = useOverlayStore.getState();
    const userId    = profile?.id;
    const sessionId = session.session_id;
    if (!userId || !sessionId) return;

    try {
      const dbModel       = toDbModel(overlay.active_model);
      const transcript    = stt.transcript ?? "";
      const questionCount = orchestrator.totalQuestions ?? 0;
      const allAnswers    = answersRef.current;
      const endedAt       = new Date().toISOString();

      const overallScore = calculateOverallScore(
        allAnswers, wpmHook.wpm, fillerHook.totalCount, questionCount,
      );

      const durationMs      = Date.now() - new Date(startTimeRef.current).getTime();
      const durationMinutes = Math.round(durationMs / 60_000);
      const sessionTitle    = `Mock Interview — ${new Date(startTimeRef.current)
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

      /* 1 — sessions row */
      await sessionsDB.update(sessionId, {
        status:            "completed",
        credits_used:      session.credits_consumed,
        model_used:        dbModel,
        ended_at:          endedAt,
        filler_words:      fillerHook.totalCount,
        avg_wpm:           wpmHook.wpm,
        hints_used:        overlay.hint_history.length,
        answers_generated: overlay.hint_history.length,
        questions_asked:   questionCount,
        notes:             transcript || null,
        overall_score:     overallScore,      // FIX: now saved
        duration_minutes:  durationMinutes,   // FIX: now saved
        title:             sessionTitle,      // FIX: now saved
      });

      /* 2 — session_answers (per-question records) — FIX: was never inserted */
      if (allAnswers.length > 0) {
        const answerRows = allAnswers.map((a) => ({
          session_id:     sessionId,
          question_index: a.question_index,
          question_text:  a.question_text,
          answer_text:    a.answer_text,
          duration_ms:    a.duration_ms,
          filler_count:   a.filler_count,
          avg_wpm:        a.avg_wpm,
          skipped:        a.skipped,
          answered_at:    a.answered_at,
        }));

        const { error: answerErr } = await supabase
          .from("session_answers")
          .insert(answerRows);

        if (answerErr) {
          // Non-fatal — session header is saved; surface as a warning not a blocker
          console.warn("[MockSession] session_answers insert failed:", answerErr.message);
        }
      }

      /* 3 — session_transcripts */
      if (transcript) {
        await supabase.from("session_transcripts").insert({
          session_id: sessionId,
          content:    transcript,
          speaker:    "candidate",
          is_final:   true,
        });
      }

      /* 4 — session_ai_interactions */
      if (overlay.hint_history.length > 0) {
        const interactions = (overlay.hint_history as Array<{
          question: string;
          hint:     string;
        }>).map((h) => ({
          session_id: sessionId,
          type:       "hint" as const,
          prompt:     h.question,
          response:   h.hint,
          model:      dbModel,
        }));
        await supabase.from("session_ai_interactions").insert(interactions);
      }
    } catch (err) {
      console.error("[MockSession] Failed to persist session:", err);
      toast.error("Session data may not have saved completely. Check your connection.");
    }
  }, [
    profile?.id,
    stt.transcript,
    wpmHook.wpm,
    fillerHook.totalCount,
    orchestrator.totalQuestions,
  ]);

  /* ── SETUP ────────────────────────────────────────────────────────────── */

  async function handleSetup(config: LiveSessionConfig) {
    sessionConfigRef.current = config;
    startTimeRef.current     = new Date().toISOString();
    answersRef.current       = [];
    endCalledRef.current     = false;

    const overlay = useOverlayStore.getState();
    overlay.resetSessionState();
    overlay.setActiveModel(config.model);
    overlay.setHintStyle(config.hint_style);
    overlay.setProctorSafe(config.stealth_mode);

    // FIX: "loading" phase shown while questions are fetching
    setPhase("loading");

    await orchestrator.createSession({
      session_type:   "mock",
      interview_type: config.interview_type,
      hint_style:     config.hint_style,
      model:          config.model,
      resume_id:      config.resume_id,
      jd_id:          config.jd_id,
    });

    const userId    = profile?.id;
    const sessionId = useSessionStore.getState().session_id;

    if (userId && sessionId) {
      try {
        await sessionsDB.create({
          id:         sessionId,
          user_id:    userId,
          type:       "mock",
          status:     "active",
          started_at: startTimeRef.current,
          model_used: toDbModel(config.model),
          title: `Mock Interview — ${new Date().toLocaleDateString(
            "en-US", { month: "short", day: "numeric", year: "numeric" },
          )}`,
        });
      } catch (err) {
        console.error("[MockSession] Failed to create session record:", err);
        toast.error("Failed to start session — could not save to database.");
        setPhase("setup");
        return;
      }
    }

    // FIX: fetch questions from generate-questions EF, then seed orchestrator
    try {
      const questions = await fetchQuestionsFromEF(config, DEFAULT_QUESTION_COUNT);
      // orchestrator.setQuestions() receives GeneratedQuestion[] and exposes them
      // via currentQuestion / currentQuestionIndex / totalQuestions
      orchestrator.setQuestions(questions);
    } catch (err) {
      console.error("[MockSession] Failed to fetch questions:", err);
      toast.error("Could not load interview questions. Please try again.");
      setPhase("setup");
      return;
    }

    questionStartRef.current = Date.now();
    setPhase("active");
    stt.start();
  }

  /* ── NEXT QUESTION ────────────────────────────────────────────────────── */

  async function handleNextQuestion() {
    captureAnswer(false);   // snapshot answer BEFORE STT resets
    stt.stop();

    if (isLastQ) {
      clearInterval(sessionTimerRef.current!);
      useOverlayStore.getState().hideOverlay();
      await persistMockSession();
      await orchestrator.completeSession();
      const sessionId = useSessionStore.getState().session_id;
      // FIX: navigate to results — was missing entirely
      navigate(sessionId ? `/app/sessions/${sessionId}` : "/app/sessions");
    } else {
      orchestrator.nextQuestion();
      stt.start();
    }
  }

  /* ── HINT ─────────────────────────────────────────────────────────────── */

  async function handleRequestHint() {
    if (questionText) {
      useOverlayStore.getState().setCurrentQuestion(questionText);
      await orchestrator.requestHint(questionText);
    }
  }

  /* ── END SESSION ──────────────────────────────────────────────────────── */

  // useCallback so the ref stays stable and the timer always invokes
  // the same logical function (not a stale closure from mount time)
  const handleEndSession = useCallback(async () => {
    if (endCalledRef.current) return;   // FIX: prevents double-end from timer + manual
    endCalledRef.current = true;

    clearInterval(sessionTimerRef.current!);
    captureAnswer(false);
    stt.stop();
    useOverlayStore.getState().hideOverlay();
    await persistMockSession();
    await orchestrator.completeSession();

    const sessionId = useSessionStore.getState().session_id;
    navigate(sessionId ? `/app/sessions/${sessionId}` : "/app/sessions");
  }, [captureAnswer, stt, persistMockSession, orchestrator, navigate]);

  // Sync latest handleEndSession into ref every render so timer uses it
  useEffect(() => {
    handleEndSessionRef.current = handleEndSession;
  }, [handleEndSession]);

  /* ── RENDER: SETUP ────────────────────────────────────────────────────── */

  if (phase === "setup") {
    return <PreSessionSetup onStart={handleSetup} sessionType="mock" />;
  }

  /* ── RENDER: LOADING (question EF fetch in progress) ─────────────────── */

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Generating your questions…</p>
          <p className="text-muted-foreground/50 text-xs">
            Tailored to your resume and job description
          </p>
        </div>
      </div>
    );
  }

  /* ── RENDER: PANIC MODE ───────────────────────────────────────────────── */

  if (panicMode) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center cursor-pointer"
        onClick={() => setPanicMode(false)}
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-accent/5 rounded-2xl flex items-center justify-center mx-auto">
            <Eye className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Click anywhere to restore</p>
          <kbd className="text-[10px] text-muted-foreground bg-secondary px-2 py-1 rounded">
            Ctrl+Shift+P
          </kbd>
        </div>
      </div>
    );
  }

  /* ── RENDER: QUESTION LOADING SPINNER (orchestrator not yet ready) ────── */

  if (!question && phase === "active") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading question…</p>
        </div>
      </div>
    );
  }

  /* ── RENDER: ACTIVE SESSION ───────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LiveSessionController isActive={true} />

      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-lg space-y-4 sm:space-y-6 p-3 sm:p-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">
                Question{" "}
                <span className="text-foreground font-bold">{qIndex + 1}</span>
                {" "}/ {totalQ}
              </span>
              <Badge variant="violet" size="sm">mock</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setPanicMode(true)}
                leftIcon={<EyeOff className="w-3 h-3" />}
              >
                Panic
              </Button>
              <Button
                variant="danger"
                size="xs"
                onClick={() => setEndConfirm(true)}
                leftIcon={<Square className="w-3 h-3" />}
              >
                End
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
            />
          </div>

          {/* Question card */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={cn(
                "flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums",
                timeColor === "emerald" ? "text-emerald-400" :
                timeColor === "amber"   ? "text-amber-400"   : "text-red-400",
              )}>
                <Timer className="w-3.5 h-3.5" />
                {Math.floor(sessionTimeLeft / 60)}:
                {String(sessionTimeLeft % 60).padStart(2, "0")}
              </div>
              <button
                onClick={() => setSkipConfirm(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                Skip
              </button>
            </div>
            <p className="text-foreground text-sm sm:text-base font-medium leading-relaxed">
              {questionText}
            </p>
          </div>

          {/* Answer card */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  stt.isListening
                    ? "bg-red-500 animate-pulse"
                    : "bg-muted-foreground/30",
                )} />
                <span className="text-xs font-medium text-foreground">Your answer</span>
                <span className={cn(
                  "text-xs font-medium",
                  wpmHook.wpm > 160 ? "text-amber-400" :
                  wpmHook.wpm < 80  ? "text-blue-400"  : "text-emerald-400",
                )}>
                  {wpmHook.wpm} WPM
                </span>
              </div>
              <button
                onClick={stt.toggleMute}
                className="p-1.5 rounded-lg hover:bg-accent/10 transition-all"
                aria-label={stt.isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {stt.isMuted
                  ? <MicOff className="w-3.5 h-3.5 text-red-400"   />
                  : <Mic    className="w-3.5 h-3.5 text-emerald-400" />
                }
              </button>
            </div>

            <div className="min-h-[60px] text-sm text-foreground leading-relaxed">
              {stt.transcript || (
                <span className="text-muted-foreground italic">Start speaking…</span>
              )}
              {stt.interimTranscript && (
                <span className="text-muted-foreground italic">
                  {" "}{stt.interimTranscript}
                </span>
              )}
            </div>

            {fillerHook.totalCount > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Fillers:</span>
                {Object.entries(fillerHook.counts as Record<string, number>)
                  .filter(([, count]) => count > 0)
                  .map(([word, count]) => (
                    <Badge key={word} variant="amber" size="sm">
                      "{word}" ×{count}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          {/* Next / Finish */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => void handleNextQuestion()}
            rightIcon={
              isLastQ
                ? <Square       className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />
            }
          >
            {isLastQ ? "Finish & see scorecard" : "Next question"}
          </Button>

          <p className="text-center text-xs text-muted-foreground/40">
            The overlay window provides AI hints, transcript, and session status.
            Use{" "}
            <kbd className="px-1 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+H</kbd>
            {" "}to toggle it.
          </p>
        </div>
      </div>

      <OverlayWindow
        onToggleMic={stt.toggleMute}
        onGenerate={() => void handleRequestHint()}
        onEndSession={() => void handleEndSession()}
        onManualQuestion={(q: string) => {
          useOverlayStore.getState().setCurrentQuestion(q);
          void orchestrator.requestHint(q);
        }}
      />

      {/* Skip confirm */}
      <Modal
        open={skipConfirm}
        onClose={() => setSkipConfirm(false)}
        title="Skip question?"
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-5">
          This question will be marked as skipped. Your answer so far will be saved.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth
            onClick={() => setSkipConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" fullWidth
            onClick={() => {
              setSkipConfirm(false);
              captureAnswer(true);    // FIX: mark answer as skipped before advancing
              if (isLastQ) {
                void handleEndSession();
              } else {
                orchestrator.nextQuestion();
                stt.resetTranscript(); // FIX: was missing from original skip handler
                stt.start();
              }
            }}>
            Skip
          </Button>
        </div>
      </Modal>

      {/* End confirm */}
      <Modal
        open={endConfirm}
        onClose={() => setEndConfirm(false)}
        title="End session early?"
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-5">
          Your answers so far will be saved to your session history.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth
            onClick={() => setEndConfirm(false)}>
            Continue
          </Button>
          <Button variant="danger" size="sm" fullWidth
            onClick={() => { setEndConfirm(false); void handleEndSession(); }}>
            End & save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
