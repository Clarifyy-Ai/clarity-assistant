// src/pages/app/mock/MockSession.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { getOrCreateSession, activateSession } from "@/lib/session/sessionLifecycle";
import { supabase } from "@/lib/supabase/client";
import { toDbModel } from "@/lib/ai/modelMapping";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  Mic,
  MicOff,
  Square,
  ChevronRight,
  SkipForward,
  Eye,
  EyeOff,
  Timer,
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
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useAuthStore((s) => s.profile);

  const orchestrator = useSessionOrchestrator() as any;
  const stt = useSpeechRecognition() as any;
  const fillerHook = useFillerWordDetection(stt.interimTranscript) as any;
  const wpmHook = useWPMTracker(stt.transcript) as any;
  const sentimentHook = useSentimentAnalysis(stt.transcript) as any;

  const startTimeRef = useRef<string>(new Date().toISOString());

  const [phase, setPhase] = useState<"setup" | "loading" | "active">("setup");
  const [panicMode, setPanicMode] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);

  const sessionConfigRef = useRef<LiveSessionConfig | null>(null);
  const isStartingRef = useRef(false);
  const autoStartedRef = useRef(false);

  const SESSION_DURATION = 5 * 60;
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_DURATION);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endCalledRef = useRef(false);

  const answersRef = useRef<QuestionAnswer[]>([]);
  const questionStartRef = useRef<number>(Date.now());

  const handleEndSessionRef = useRef<() => Promise<void>>();

  // Overlay mount/unmount behavior
  useEffect(() => {
    if (phase === "active") {
      useOverlayStore.getState().showOverlay();
    }
    return () => {
      useOverlayStore.getState().hideOverlay();
    };
  }, [phase]);

  // Timer
  useEffect(() => {
    if (phase !== "active") return;

    sessionTimerRef.current = setInterval(() => {
      setSessionTimeLeft((t) => {
        if (t <= 1) {
          if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
          handleEndSessionRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [phase]);

  // Reset per-question metrics when question changes
  useEffect(() => {
    if (phase !== "active") return;
    stt.resetTranscript();
    fillerHook.reset();
    wpmHook.reset();
    questionStartRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator.currentQuestionIndex]);

  // Hotkeys
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
  const qIndex = orchestrator.currentQuestionIndex ?? 0;
  const totalQ = orchestrator.totalQuestions ?? 5;
  const isLastQ = qIndex >= totalQ - 1;

  const prevTranscriptLenRef = useRef(0);

  // When question changes, push to overlay and auto-generate hint if enabled
  useEffect(() => {
    if (phase !== "active" || !question) return;

    const qText = typeof question === "string" ? question : question.question_text ?? "";
    if (qText) {
      prevTranscriptLenRef.current = 0;
      useOverlayStore.getState().setCurrentQuestion(qText);
      if (useOverlayStore.getState().auto_generate) {
        void handleRequestHint(qText);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question]);

  // Push transcript deltas to audio store (candidate utterances)
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

  // Interim transcript
  useEffect(() => {
    if (phase !== "active") return;
    if (stt.interimTranscript) {
      useAudioStore.getState().updateInterimText(stt.interimTranscript);
    }
  }, [phase, stt.interimTranscript]);

  const timeColor =
    sessionTimeLeft > 120 ? "emerald" : sessionTimeLeft > 30 ? "amber" : "red";

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
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    sessionConfigRef.current = config;
    startTimeRef.current = new Date().toISOString();
    endCalledRef.current = false;

    const overlay = useOverlayStore.getState();
    overlay.resetSessionState();

    overlay.setStealthMode(!!config.stealth_mode);
    overlay.setProctorSafe(false);

    overlay.setActiveModel(config.model);
    overlay.setHintStyle(config.hint_style);

    const userId = profile?.id;
    if (!userId) {
      toast.error("You must be signed in to start a session.");
      isStartingRef.current = false;
      return;
    }

    let dbSessionId: string | null = null;
    try {
      const { session, reused } = await getOrCreateSession({
        user_id: userId,
        type: "mock",
        title: config.company ? `Mock — ${config.company}` : "Mock interview",
        document_id: null,
        jd_id: config.jd_id ?? null,
        model_used: toDbModel(config.model) as any,
      });
      dbSessionId = session.id;
      if (reused) toast.message("Resuming your in-progress session");
      await activateSession(session.id);
    } catch (err) {
      console.error("[MockSession] Failed to create/reuse session record:", err);
      toast.error(
        "Failed to start session — could not save to database. Check your connection and try again."
      );
      isStartingRef.current = false;
      return;
    }

    await orchestrator.createSession({
      session_type: "mock",
      interview_type: config.interview_type,
      hint_style: config.hint_style,
      model: config.model,
      resume_id: config.resume_id,
      jd_id: config.jd_id,
      session_id: dbSessionId,
    });

    setPhase("loading");
    try {
      const { data, error } = await supabase.functions.invoke("generate-questions", {
        body: {
          interview_type: config.interview_type,
          experience_level: profile?.experience_years
            ? profile.experience_years > 5
              ? "senior"
              : profile.experience_years > 2
                ? "mid"
                : "junior"
            : "mid",
          company: config.company || "",
          role: profile?.target_role || "",
          question_count: (config as any).question_count ?? 5,
          session_id: dbSessionId,
          user_id: userId,
          config,
          free_session: true,
        },
      });

      const questions =
        (data as any)?.questions ??
        (data as any)?.data?.questions ??
        (data as any)?.data?.data?.questions ??
        [];

      if (error || !Array.isArray(questions) || questions.length === 0) {
        await sessionsDB.update(
          dbSessionId,
          { status: "abandoned", ended_at: new Date().toISOString() } as any
        );
        throw new Error(error?.message || (data as any)?.error || "Failed to generate questions");
      } else {
        orchestrator.setQuestions?.(questions);
      }
    } catch (err) {
      console.error("[MockSession] generate-questions error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate questions. Please try again.");
      setPhase("setup");
      isStartingRef.current = false;
      return;
    }

    setPhase("active");
    isStartingRef.current = false;
    stt.start();
  }

  useEffect(() => {
    const configFromRoute = (location.state as { config?: LiveSessionConfig } | null)?.config;
    if (!configFromRoute || autoStartedRef.current || phase !== "setup") return;
    autoStartedRef.current = true;
    void handleSetup(configFromRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, phase]);

  async function handleNextQuestion() {
    captureAnswer();
    stt.stop();

    if (isLastQ) {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      useOverlayStore.getState().hideOverlay();
      await persistMockSession();
      await orchestrator.completeSession();
      const sessionId = useSessionStore.getState().session_id;
      if (sessionId) navigate(`/app/scorecard/${sessionId}`);
      else navigate("/app/sessions");
    } else {
      orchestrator.nextQuestion();
      stt.start();
    }
  }

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
    const userId = profile?.id;
    const sessionId = session.session_id;

    if (!userId || !sessionId) return;

    try {
      const dbModel = toDbModel(overlay.active_model) as any;
      const transcript = stt.transcript || "";
      const questionCount = orchestrator.totalQuestions ?? 0;
      const startedMs = startTimeRef.current
        ? new Date(startTimeRef.current).getTime()
        : Date.now();
      const duration_seconds = Math.max(1, Math.round((Date.now() - startedMs) / 1000));

      await sessionsDB.update(sessionId, {
        status: "completed",
        credits_used: session.credits_consumed,
        model_used: dbModel as any,
        ended_at: new Date().toISOString(),
        started_at: startTimeRef.current ?? new Date().toISOString(),
        duration_seconds,
        filler_words: fillerHook.totalCount,
        avg_wpm: wpmHook.wpm,
        hints_used: overlay.hint_history.length,
        answers_generated: answersRef.current.filter((a) => !a.skipped).length,
        questions_asked: questionCount,
        notes: transcript || null,
        session_type: "mock",
      } as any);

      if (transcript) {
        await supabase.from("session_transcripts").insert({
          session_id: sessionId,
          user_id: userId,
          transcript,
        } as any);
      }

      if (overlay.hint_history.length > 0) {
        const interactions = overlay.hint_history.map((h: any) => ({
          session_id: sessionId,
          user_id: userId,
          type: "hint" as const,
          prompt: h.question,
          response: h.hint,
          model: dbModel,
        }));
        await supabase.from("session_ai_interactions").insert(interactions as any);
      }

      if (answersRef.current.length > 0) {
        const answerRows = answersRef.current.map((a) => ({
          session_id: sessionId,
          user_id: userId,
          question: a.question_text,
          answer: a.answer_text,
          duration_ms: a.duration_seconds * 1000,
        }));
        await supabase.from("session_answers").insert(answerRows as any).then(({ error }: any) => {
          if (error) console.error("[MockSession] Failed to save session_answers:", error);
        });
      }

      await useAuthStore.getState().refreshCredits();
    } catch (err) {
      console.error("[MockSession] Failed to persist session:", err);
    }
  }

  async function handleEndSession() {
    if (endCalledRef.current) return;
    endCalledRef.current = true;

    captureAnswer();
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    stt.stop();
    useOverlayStore.getState().hideOverlay();
    await persistMockSession();
    await orchestrator.completeSession();
    const sessionId = useSessionStore.getState().session_id;
    if (sessionId) navigate(`/app/scorecard/${sessionId}`);
    else navigate("/app/sessions");
  }

  useEffect(() => {
    handleEndSessionRef.current = handleEndSession;
  });

  // UI phases
  if (phase === "setup") {
    return (
      <PreSessionSetup
        onStart={handleSetup}
        sessionType="mock"
        initialConfig={sessionConfigRef.current ?? undefined}
      />
    );
  }

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

  const timerDisplay =
    sessionTimeLeft <= 0
      ? "Saving..."
      : `${Math.floor(sessionTimeLeft / 60)}:${String(sessionTimeLeft % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-screen max-h-screen overflow-y-auto bg-background text-foreground">
      <LiveSessionController isActive={true} />
      <OverlayKeyboardHandler enabled={phase === "active"} onToggleMute={stt.toggleMute} />

      {/* Main UI */}
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-lg space-y-4 sm:space-y-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">
                Question <span className="text-foreground font-bold">{qIndex + 1}</span> / {totalQ}
              </span>
              <Badge variant="violet" size="sm">
                mock
              </Badge>
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

          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums",
                  sessionTimeLeft <= 0
                    ? "text-muted-foreground"
                    : timeColor === "emerald"
                      ? "text-emerald-400"
                      : timeColor === "amber"
                        ? "text-amber-400"
                        : "text-red-400"
                )}
              >
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
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    stt.isListening ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30"
                  )}
                />
                <span className="text-xs font-medium text-foreground">Your answer</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    wpmHook.wpm > 160 ? "text-amber-400" : wpmHook.wpm < 80 ? "text-amber-400" : "text-emerald-400"
                  )}
                  title={
                    wpmHook.wpm < 80
                      ? "Speaking slowly — try to increase pace"
                      : wpmHook.wpm > 160
                        ? "Speaking fast — try to slow down"
                        : "Good pace"
                  }
                >
                  {wpmHook.wpm} WPM
                </span>
              </div>
              <button onClick={stt.toggleMute} className="p-1.5 rounded-lg hover:bg-accent/10 transition-all">
                {stt.isMuted ? (
                  <MicOff className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>
            </div>

            <div className="min-h-[60px] text-sm text-foreground leading-relaxed">
              {stt.transcript || <span className="text-muted-foreground italic">Start speaking…</span>}
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
            rightIcon={isLastQ ? <Square className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          >
            {isLastQ ? "Finish & see scorecard" : "Next question"}
          </Button>

          <p className="text-center text-xs text-muted-foreground/40">
            The overlay window provides AI hints, transcript, and session status. Use{" "}
            <kbd className="px-1 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+H</kbd> to toggle it.
          </p>
        </div>
      </div>

      {/* Overlay */}
      <OverlayWindow
        onToggleMic={stt.toggleMute}
        onGenerate={() => handleRequestHint()}
        onEndSession={handleEndSession}
        onManualQuestion={(q: string) => {
          useOverlayStore.getState().setCurrentQuestion(q);
          orchestrator.requestHint(q);
        }}
      />

      {/* Modals */}
      <Modal open={skipConfirm} onClose={() => setSkipConfirm(false)} title="Skip question?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">This question will be marked as skipped.</p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setSkipConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={() => {
              captureAnswer(true);
              setSkipConfirm(false);
              if (isLastQ) {
                void handleEndSession();
              } else {
                orchestrator.nextQuestion();
              }
            }}
          >
            Skip
          </Button>
        </div>
      </Modal>

      <Modal open={endConfirm} onClose={() => setEndConfirm(false)} title="End session early?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">Your progress will be saved.</p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setEndConfirm(false)}>
            Continue
          </Button>
          <Button variant="danger" size="sm" fullWidth onClick={() => void handleEndSession()}>
            End & save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
