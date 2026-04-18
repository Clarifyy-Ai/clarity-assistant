// src/pages/app/mock/MockSession.tsx
// FIX: Removed @ts-nocheck. Fixed imports, timer ref, double-end guard,
// session_answers population, navigation after completion, WPM colors,
// filler word typography, hotkey phase guard, hint race condition,
// timer "Saving..." text, skip marking, credits refresh.

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
import { useAuthStore } from "@/store/authStore";
import { useAudioStore } from "@/store/audioStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { PreSessionSetup } from "@/components/session/PreSessionSetup";
import { sessionsDB } from "@/lib/supabase/database";
import { supabase } from "@/lib/supabase/client";
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

/* ─── TYPES ─────────────────────────────────────────────────────────────── */

interface QuestionAnswer {
  question_text: string;
  answer_text: string;
  question_index: number;
  skipped: boolean;
  filler_count: number;
  wpm: number;
  duration_seconds: number;
  timestamp: string;
}

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */

export default function MockSession() {
  const navigate      = useNavigate();
  const profile       = useAuthStore((s) => s.profile);
  const orchestrator  = useSessionOrchestrator() as any;
  const stt           = useSpeechRecognition() as any;
  const fillerHook    = useFillerWordDetection(stt.interimTranscript) as any;
  const wpmHook       = useWPMTracker(stt.transcript) as any;
  const sentimentHook = useSentimentAnalysis(stt.transcript) as any;
  const startTimeRef  = useRef<string>(new Date().toISOString());

  const [phase,        setPhase]       = useState<"setup" | "loading" | "active">("setup");
  const [panicMode,    setPanicMode]   = useState(false);
  const [skipConfirm,  setSkipConfirm] = useState(false);
  const [endConfirm,   setEndConfirm]  = useState(false);
  const sessionConfigRef = useRef<LiveSessionConfig | null>(null);

  const SESSION_DURATION = 5 * 60;
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_DURATION);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIX Issue 10: double-end guard
  const endCalledRef = useRef(false);

  // FIX Issue 11: track answers for session_answers table
  const answersRef = useRef<QuestionAnswer[]>([]);
  const questionStartRef = useRef<number>(Date.now());

  // FIX Issue 9: store handleEndSession in ref to avoid stale timer closure
  const handleEndSessionRef = useRef<() => Promise<void>>();

  useEffect(() => {
    if (phase === "active") {
      useOverlayStore.getState().showOverlay();
    }
    return () => {
      useOverlayStore.getState().hideOverlay();
    };
  }, [phase]);

  // FIX Issue 9: timer uses ref to avoid stale closure
  useEffect(() => {
    if (phase !== "active") return;
    sessionTimerRef.current = setInterval(() => {
      setSessionTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(sessionTimerRef.current!);
          handleEndSessionRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(sessionTimerRef.current!);
  }, [phase]);

  useEffect(() => {
    if (phase !== "active") return;
    stt.resetTranscript();
    fillerHook.reset();
    wpmHook.reset();
    questionStartRef.current = Date.now();
  }, [orchestrator.currentQuestionIndex]);

  // FIX Issue 4: guard hotkeys with phase check
  useHotkeys({
    "ctrl+shift+h": () => {
      if (phase !== "active") return;
      const overlay = useOverlayStore.getState();
      overlay.is_visible ? overlay.hideOverlay() : overlay.showOverlay();
    },
    "ctrl+shift+p": () => {
      if (phase !== "active") return;
      setPanicMode((p) => !p);
    },
    "ctrl+shift+s": () => {
      if (phase !== "active") return;
      stt.toggleMute();
    },
    "ctrl+shift+n": () => {
      if (phase !== "active") return;
      setSkipConfirm(true);
    },
  });

  const question = orchestrator.currentQuestion;
  const qIndex   = orchestrator.currentQuestionIndex ?? 0;
  const totalQ   = orchestrator.totalQuestions ?? 5;
  const isLastQ  = qIndex >= totalQ - 1;

  const prevTranscriptLenRef = useRef(0);
  useEffect(() => {
    if (phase !== "active" || !question) return;
    const qText = typeof question === "string" ? question : question.question_text ?? "";
    if (qText) {
      prevTranscriptLenRef.current = 0;
      useOverlayStore.getState().setCurrentQuestion(qText);
      // FIX Issue 5: pass question text directly to avoid store race
      if (useOverlayStore.getState().auto_generate) {
        handleRequestHint(qText);
      }
    }
  }, [phase, question]);

  useEffect(() => {
    if (phase !== "active" || !stt.transcript) return;
    const full = stt.transcript.trim();
    if (!full || full.length <= prevTranscriptLenRef.current) return;
    const delta = full.slice(prevTranscriptLenRef.current).trim();
    prevTranscriptLenRef.current = full.length;
    if (!delta) return;
    const now = Date.now();
    useAudioStore.getState().addUtterance({
      id: `mock-${now}`,
      text: delta,
      speaker: "candidate",
      words: [],
      start_ms: now,
      end_ms: now,
      is_final: true,
      is_interviewer_question: false,
      confidence: 1.0,
    });
  }, [phase, stt.transcript]);

  useEffect(() => {
    if (phase !== "active") return;
    if (stt.interimTranscript) {
      useAudioStore.getState().updateInterimText(stt.interimTranscript);
    }
  }, [phase, stt.interimTranscript]);

  const timeColor =
    sessionTimeLeft > 120 ? "emerald" :
    sessionTimeLeft > 30  ? "amber"   : "red";

  // FIX Issue 11: capture answer before advancing
  function captureAnswer(skipped = false) {
    const qText = typeof question === "string" ? question : question?.question_text ?? "";
    const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
    answersRef.current.push({
      question_text: qText,
      answer_text: skipped ? "" : (stt.transcript || ""),
      question_index: qIndex,
      skipped,
      filler_count: fillerHook.totalCount ?? 0,
      wpm: wpmHook.wpm ?? 0,
      duration_seconds: elapsed,
      timestamp: new Date().toISOString(),
    });
  }

  async function handleSetup(config: LiveSessionConfig) {
    sessionConfigRef.current = config;
    startTimeRef.current = new Date().toISOString();
    endCalledRef.current = false;

    const overlay = useOverlayStore.getState();
    overlay.resetSessionState();
    overlay.setActiveModel(config.model);
    overlay.setHintStyle(config.hint_style);
    overlay.setProctorSafe(config.stealth_mode);

    await orchestrator.createSession({
      session_type:    "mock",
      interview_type:  config.interview_type,
      hint_style:      config.hint_style,
      model:           config.model,
      resume_id:       config.resume_id,
      jd_id:           config.jd_id,
    });

    const userId = profile?.id;
    const sessionId = useSessionStore.getState().session_id;
    if (userId && sessionId) {
      try {
        await sessionsDB.create({
          id:         sessionId,
          user_id:    userId,
          type:       "mock",
          status:     "active",
          started_at: startTimeRef.current,
          model_used: toDbModel(config.model) as any,
        });
      } catch (err) {
        console.error("[MockSession] Failed to create session record:", err);
        toast.error("Failed to start session — could not save to database. Check your connection and try again.");
        return;
      }
    }

    // FIX Issue 8: Fetch questions from EF
    setPhase("loading");
    try {
      const { data, error } = await supabase.functions.invoke("generate-questions", {
        body: {
          interview_type: config.interview_type,
          experience_level: profile?.experience_years ? 
            (profile.experience_years > 5 ? "senior" : profile.experience_years > 2 ? "mid" : "junior") : "mid",
          company: config.company || "",
          role: profile?.target_role || "",
          question_count: 5,
        },
      });

      if (error || !data?.questions?.length) {
        console.warn("[MockSession] generate-questions failed, using orchestrator fallback");
      } else {
        orchestrator.setQuestions?.(data.questions);
      }
    } catch (err) {
      console.warn("[MockSession] generate-questions error:", err);
    }

    setPhase("active");
    stt.start();
  }

  async function handleNextQuestion() {
    captureAnswer(); // FIX Issue 11
    stt.stop();

    if (isLastQ) {
      clearInterval(sessionTimerRef.current!);
      useOverlayStore.getState().hideOverlay();
      await persistMockSession();
      await orchestrator.completeSession();
      // FIX Issue 12: navigate after completion
      const sessionId = useSessionStore.getState().session_id;
      if (sessionId) navigate(`/app/sessions/${sessionId}`);
    } else {
      orchestrator.nextQuestion();
      stt.start();
    }
  }

  // FIX Issue 5: accept optional questionText parameter
  async function handleRequestHint(questionText?: string) {
    const q = questionText || (typeof question === "string" ? question : question?.question_text);
    if (q) {
      useOverlayStore.getState().setCurrentQuestion(q);
      await orchestrator.requestHint(q);
    }
  }

  async function persistMockSession() {
    const session = useSessionStore.getState();
    const overlay = useOverlayStore.getState();
    const userId  = profile?.id;
    const sessionId = session.session_id;

    if (!userId || !sessionId) return;

    try {
      const dbModel = toDbModel(overlay.active_model) as any;
      const transcript = stt.transcript || "";
      const questionCount = orchestrator.totalQuestions ?? 0;

      await sessionsDB.update(sessionId, {
        status:            "completed",
        credits_used:      session.credits_consumed,
        model_used:        dbModel as any,
        ended_at:          new Date().toISOString(),
        filler_words:      fillerHook.totalCount,
        avg_wpm:           wpmHook.wpm,
        hints_used:        overlay.hint_history.length,
        answers_generated: overlay.hint_history.length,
        questions_asked:   questionCount,
        notes:             transcript || null,
      } as any);

      if (transcript) {
        await supabase.from("session_transcripts").insert({
          session_id: sessionId,
          user_id:    userId,
          content:    transcript,
          speaker:    "candidate",
          is_final:   true,
        } as any);
      }

      if (overlay.hint_history.length > 0) {
        const interactions = overlay.hint_history.map((h) => ({
          session_id: sessionId,
          user_id:    userId,
          type:       "hint" as const,
          prompt:     h.question,
          response:   h.hint,
          model:      dbModel,
        }));
        await supabase.from("session_ai_interactions").insert(interactions as any);
      }

      // FIX Issue 11: populate session_answers
      if (answersRef.current.length > 0) {
        const answerRows = answersRef.current.map((a) => ({
          session_id: sessionId,
          user_id:    userId,
          question:   a.question_text,
          answer:     a.answer_text,
          duration_ms: a.duration_seconds * 1000,
        }));
        await supabase.from("session_answers").insert(answerRows as any).then(({ error }: any) => {
          if (error) console.error("[MockSession] Failed to save session_answers:", error);
        });
      }

      // FIX Issue 46: refresh credits after session
      await useAuthStore.getState().refreshCredits();
    } catch (err) {
      console.error("[MockSession] Failed to persist session:", err);
    }
  }

  async function handleEndSession() {
    // FIX Issue 10: double-end guard
    if (endCalledRef.current) return;
    endCalledRef.current = true;

    captureAnswer(); // capture current answer before ending
    clearInterval(sessionTimerRef.current!);
    stt.stop();
    useOverlayStore.getState().hideOverlay();
    await persistMockSession();
    await orchestrator.completeSession();
    // FIX Issue 12: navigate after completion
    const sessionId = useSessionStore.getState().session_id;
    if (sessionId) navigate(`/app/sessions/${sessionId}`);
  }

  // FIX Issue 9: keep ref updated
  useEffect(() => {
    handleEndSessionRef.current = handleEndSession;
  });

  if (phase === "setup") {
    return (
      <PreSessionSetup
        onStart={handleSetup}
        sessionType="mock"
        initialConfig={sessionConfigRef.current ?? undefined}
      />
    );
  }

  // FIX Issue 8: loading phase while fetching questions
  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Generating questions…</p>
        </div>
      </div>
    );
  }

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

  if (!question) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading question…</p>
        </div>
      </div>
    );
  }

  const questionText = typeof question === "string" ? question : question?.question_text ?? "";

  // FIX Issue 42: show "Saving..." when timer reaches 0
  const timerDisplay = sessionTimeLeft <= 0
    ? "Saving..."
    : `${Math.floor(sessionTimeLeft / 60)}:${String(sessionTimeLeft % 60).padStart(2, "0")}`;

  return (
    // FIX Issue 28: max-h-screen overflow-y-auto, responsive padding
    <div className="min-h-screen max-h-screen overflow-y-auto bg-background text-foreground">
      <LiveSessionController isActive={true} />

      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-lg space-y-4 sm:space-y-6 p-3 sm:p-6">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">
                Question <span className="text-foreground font-bold">{qIndex + 1}</span> / {totalQ}
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

          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
            />
          </div>

          {/* FIX Issue 28: max-h-40 with scroll on small screens */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={cn(
                "flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums",
                sessionTimeLeft <= 0 ? "text-muted-foreground" :
                timeColor === "emerald" ? "text-emerald-400" :
                timeColor === "amber"   ? "text-amber-400"   : "text-red-400"
              )}>
                <Timer className="w-3.5 h-3.5" />
                {timerDisplay}
              </div>
              <button
                onClick={() => setSkipConfirm(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                Skip
              </button>
            </div>

            <p className="text-foreground text-sm sm:text-base font-medium leading-relaxed max-h-40 overflow-y-auto">
              {questionText}
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  stt.isListening ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30"
                )} />
                <span className="text-xs font-medium text-foreground">Your answer</span>
                {/* FIX Issue 45: WPM color — slow = amber warning */}
                <span className={cn(
                  "text-xs font-medium",
                  wpmHook.wpm > 160 ? "text-amber-400" :
                  wpmHook.wpm < 80  ? "text-amber-400"  : "text-emerald-400"
                )} title={wpmHook.wpm < 80 ? "Speaking slowly — try to increase pace" : wpmHook.wpm > 160 ? "Speaking fast — try to slow down" : "Good pace"}>
                  {wpmHook.wpm} WPM
                </span>
              </div>
              <button
                onClick={stt.toggleMute}
                className="p-1.5 rounded-lg hover:bg-accent/10 transition-all"
              >
                {stt.isMuted
                  ? <MicOff className="w-3.5 h-3.5 text-red-400" />
                  : <Mic className="w-3.5 h-3.5 text-emerald-400" />
                }
              </button>
            </div>

            <div className="min-h-[60px] text-sm text-foreground leading-relaxed">
              {stt.transcript || (
                <span className="text-muted-foreground italic">Start speaking…</span>
              )}
              {stt.interimTranscript && (
                <span className="text-muted-foreground italic"> {stt.interimTranscript}</span>
              )}
            </div>

            {fillerHook.totalCount > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Fillers:</span>
                {Object.entries(fillerHook.counts)
                  .filter(([, count]) => (count as number) > 0)
                  .map(([word, count]) => (
                    <Badge key={word} variant="amber" size="sm">
                      {/* FIX Issue 43: × instead of x */}
                      "{word}" ×{count as number}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleNextQuestion}
            rightIcon={isLastQ
              ? <Square className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            }
          >
            {isLastQ ? "Finish & see scorecard" : "Next question"}
          </Button>

          <p className="text-center text-xs text-muted-foreground/40">
            The overlay window provides AI hints, transcript, and session status.
            Use <kbd className="px-1 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+H</kbd> to toggle it.
          </p>
        </div>
      </div>

      <OverlayWindow
        onToggleMic={stt.toggleMute}
        onGenerate={() => handleRequestHint()}
        onEndSession={handleEndSession}
        onManualQuestion={(q) => {
          useOverlayStore.getState().setCurrentQuestion(q);
          orchestrator.requestHint(q);
        }}
      />

      <Modal
        open={skipConfirm}
        onClose={() => setSkipConfirm(false)}
        title="Skip question?"
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-5">
          This question will be marked as skipped.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setSkipConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" fullWidth onClick={() => {
            // FIX Issue 44: mark answer as skipped
            captureAnswer(true);
            setSkipConfirm(false);
            if (isLastQ) {
              handleEndSession();
            } else {
              orchestrator.nextQuestion();
            }
          }}>
            Skip
          </Button>
        </div>
      </Modal>

      <Modal
        open={endConfirm}
        onClose={() => setEndConfirm(false)}
        title="End session early?"
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-5">
          Your progress will be saved.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setEndConfirm(false)}>
            Continue
          </Button>
          <Button variant="danger" size="sm" fullWidth onClick={handleEndSession}>
            End & save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
