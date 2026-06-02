// src/pages/app/mock/MockSession.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useAudioSession } from "@/hooks/useAudioSession";
import { useFillerWordDetection } from "@/hooks/useFillerWordDetection";
import { useWPMTracker } from "@/hooks/useWPMTracker";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAuthStore } from "@/store/authStore";
import { useAudioStore } from "@/store/audioStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { PreSessionSetup } from "@/components/session/PreSessionSetup";
import { MockConversationPanel } from "@/components/mock/MockConversationPanel";
import {
  sessionsDB,
  sessionTranscriptsDB,
  sessionAnswersDB,
} from "@/lib/supabase/database";
import { getOrCreateSession, activateSession } from "@/lib/session/sessionLifecycle";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { toDbModel } from "@/lib/ai/modelMapping";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { PANIC_RESPONSE } from "@/types/session.types";
import type { LiveSessionConfig, SessionQuestion } from "@/types/session.types";
import {
  Mic,
  MicOff,
  Square,
  ChevronRight,
  SkipForward,
  EyeOff,
  Timer,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MockSessionPhase = "idle" | "configuring" | "active" | "completed";

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

  const orchestrator = useSessionOrchestrator();
  const interimText = useAudioStore((s) => s.transcript?.interim_text ?? "");
  const candidateTranscript = useAudioStore((s) =>
    (s.transcript?.utterances ?? [])
      .filter((u) => u.speaker === "candidate" && u.is_final)
      .map((u) => u.text)
      .join(" "),
  );
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);
  const deepgramStatus = useAudioStore((s) => s.deepgram_status ?? "disconnected");

  const fillerHook = useFillerWordDetection(interimText);
  const wpmHook = useWPMTracker(candidateTranscript);

  const audio = useAudioSession({
    enableSystemAudio: false,
    onQuestionDetected: () => {},
    onFillerDetected: (count) => useSessionStore.getState().setFillerCount(count),
    onWPMUpdate: (wpm) => useSessionStore.getState().setCurrentWPM(wpm),
  });

  const startTimeRef = useRef<string>(new Date().toISOString());

  const [phase, setPhase] = useState<MockSessionPhase>("idle");
  const [calmMode, setCalmMode] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const sessionConfigRef = useRef<LiveSessionConfig | null>(null);
  const questionsCacheRef = useRef<SessionQuestion[] | null>(null);
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

  const injectInterviewerQuestion = useCallback(
    (qText: string, index: number) => {
      if (!qText.trim()) return;
      const store = useAudioStore.getState();
      const utteranceId = `mock-q-${index}`;
      if (store.transcript.utterances.some((u) => u.id === utteranceId)) return;

      const now = Date.now();
      store.addUtterance({
        id: utteranceId,
        text: qText.trim(),
        speaker: "interviewer",
        words: [],
        start_ms: now,
        end_ms: now,
        is_final: true,
        is_interviewer_question: true,
        confidence: 1,
      });
      store.setCurrentSpeaker("interviewer");
      store.setLastQuestion(qText.trim());
    },
    [],
  );

  useEffect(() => {
    if (phase !== "active") return;
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
      setCalmMode((p) => !p);
    },
    "ctrl+shift+s": () => {
      if (phase !== "active") return;
      audio.toggleMute();
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

  useEffect(() => {
    if (phase !== "active" || !question) return;

    const qText = typeof question === "string" ? question : question.question_text ?? "";
    if (qText) {
      injectInterviewerQuestion(qText, qIndex);
      useOverlayStore.getState().setCurrentQuestion(qText);
      if (useOverlayStore.getState().auto_generate) {
        void handleRequestHint(qText);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question, qIndex, injectInterviewerQuestion]);

  const timeColor =
    sessionTimeLeft > 120 ? "emerald" : sessionTimeLeft > 30 ? "amber" : "red";

  function captureAnswer(skipped = false) {
    const qText = typeof question === "string" ? question : question?.question_text ?? "";
    const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
    answersRef.current.push({
      question_text: qText,
      answer_text: skipped ? "" : candidateTranscript,
      question_index: qIndex,
      skipped,
      filler_count: fillerHook.totalCount ?? 0,
      wpm: wpmHook.wpm ?? 0,
      duration_seconds: elapsed,
      timestamp: new Date().toISOString(),
    });
  }

  async function loadQuestions(
    dbSessionId: string,
    config: LiveSessionConfig,
    userId: string,
  ): Promise<void> {
    if (questionsCacheRef.current?.length) {
      orchestrator.setQuestions(questionsCacheRef.current);
      return;
    }

    setQuestionsError(null);

    const data = await fetchEdgeJson<{ questions?: unknown[] }>("generate-questions", {
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
      question_count: (config as LiveSessionConfig & { question_count?: number }).question_count ?? 5,
      session_id: dbSessionId,
      user_id: userId,
      config,
      free_session: true,
    });

    const raw =
      data?.questions ??
      (data as { data?: { questions?: unknown[] } })?.data?.questions ??
      [];

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("No questions returned — try again.");
    }

    orchestrator.setQuestions(raw);
    const mapped = useSessionStore.getState().questions;
    questionsCacheRef.current = mapped;
  }

  async function handleSetup(config: LiveSessionConfig) {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setPhase("configuring");
    setQuestionsError(null);

    sessionConfigRef.current = config;
    startTimeRef.current = new Date().toISOString();
    endCalledRef.current = false;
    useAudioStore.getState().clearTranscript();

    const overlay = useOverlayStore.getState();
    overlay.resetSessionState();
    overlay.setStealthMode(!!config.stealth_mode);
    overlay.setProctorSafe(false);
    overlay.setActiveModel(config.model);
    overlay.setHintStyle(config.hint_style);

    const userId = profile?.id;
    if (!userId) {
      toast.error("You must be signed in to start a session.");
      setPhase("idle");
      isStartingRef.current = false;
      return;
    }

    let dbSessionId: string | null = null;
    try {
      const { session, reused } = await getOrCreateSession({
        user_id: userId,
        type: "mock",
        title: config.company ? `Mock — ${config.company}` : "Mock interview",
        document_id: config.resume_id ?? null,
        jd_id: config.jd_id ?? null,
        model_used: toDbModel(config.model) as Parameters<typeof sessionsDB.update>[1]["model_used"],
      });
      dbSessionId = session.id;
      if (reused) toast.message("Resuming your in-progress session");
      await activateSession(session.id);

      await orchestrator.createSession({
        session_type: "mock",
        interview_type: config.interview_type,
        hint_style: config.hint_style,
        model: config.model,
        resume_id: config.resume_id,
        jd_id: config.jd_id,
        session_id: dbSessionId,
      });

      await loadQuestions(dbSessionId, config, userId);
    } catch (err) {
      console.error("[MockSession] setup failed:", err);
      const message = err instanceof Error ? err.message : "Failed to start mock session";
      setQuestionsError(message);
      if (dbSessionId) {
        try {
          await sessionsDB.update(dbSessionId, {
            status: "abandoned",
            ended_at: new Date().toISOString(),
          } as Parameters<typeof sessionsDB.update>[1]);
        } catch {
          /* ignore */
        }
      }
      isStartingRef.current = false;
      return;
    }

    try {
      await audio.start();
      setPhase("active");
      overlay.showOverlay();
    } catch (err) {
      console.error("[MockSession] audio start failed:", err);
      toast.error(err instanceof Error ? err.message : "Microphone failed to start");
      setPhase("configuring");
      setQuestionsError("Audio capture failed — check permissions and retry.");
    } finally {
      isStartingRef.current = false;
    }
  }

  useEffect(() => {
    const configFromRoute = (location.state as { config?: LiveSessionConfig } | null)?.config;
    if (!configFromRoute || autoStartedRef.current || phase !== "idle") return;
    autoStartedRef.current = true;
    void handleSetup(configFromRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, phase]);

  async function handleNextQuestion() {
    captureAnswer();

    if (isLastQ) {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      setPhase("completed");
      audio.stop();
      useOverlayStore.getState().hideOverlay();
      await persistMockSession();
      await orchestrator.completeSession();
      const sessionId = useSessionStore.getState().session_id;
      if (sessionId) navigate(`/app/scorecard/${sessionId}`);
      else navigate("/app/sessions");
    } else {
      orchestrator.nextQuestion();
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
      const dbModel = toDbModel(overlay.active_model);
      const audioState = useAudioStore.getState();
      const transcript = audioState.transcript?.full_transcript ?? candidateTranscript;
      const utterances = audioState.transcript?.utterances ?? [];
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
        await sessionTranscriptsDB.create({
          session_id: sessionId,
          user_id: userId,
          transcript,
          utterances,
        });
      }

      if (answersRef.current.length > 0) {
        await sessionAnswersDB.createMany(
          answersRef.current.map((a) => ({
            session_id: sessionId,
            user_id: userId,
            question: a.question_text,
            answer: a.answer_text,
            duration_ms: a.duration_seconds * 1000,
          })),
        );
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
    setPhase("completed");
    audio.stop();
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

  const isListening =
    isCapturing && (deepgramStatus === "connected" || deepgramStatus === "reconnecting");

  if (phase === "idle") {
    return (
      <PreSessionSetup
        onStart={handleSetup}
        sessionType="mock"
        initialConfig={sessionConfigRef.current ?? undefined}
      />
    );
  }

  if (phase === "configuring") {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium text-foreground">Generating questions…</p>
            <p className="text-xs text-muted-foreground">
              Preparing your mock interview session
            </p>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full rounded-xl" />
          {questionsError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="flex-1 text-red-300">{questionsError}</span>
              <button
                type="button"
                className="font-semibold text-red-200 hover:text-red-100 whitespace-nowrap"
                onClick={() => {
                  const cfg = sessionConfigRef.current;
                  const uid = profile?.id;
                  const sid = useSessionStore.getState().session_id;
                  if (!cfg || !uid || !sid) {
                    setPhase("idle");
                    return;
                  }
                  void loadQuestions(sid, cfg, uid)
                    .then(() => audio.start())
                    .then(() => {
                      setPhase("active");
                      useOverlayStore.getState().showOverlay();
                    })
                    .catch((err: unknown) => {
                      setQuestionsError(
                        err instanceof Error ? err.message : "Retry failed",
                      );
                    });
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Saving session…</p>
        </div>
      </div>
    );
  }

  if (calmMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 space-y-4 shadow-lg">
          <h2 className="text-lg font-bold text-foreground">Calm coaching steps</h2>
          <p className="text-xs text-muted-foreground">
            Ground yourself — this panel does not hide your screen from others.
          </p>
          <ol className="space-y-3 text-sm text-foreground list-decimal list-inside">
            <li>{PANIC_RESPONSE.step_1}</li>
            <li>{PANIC_RESPONSE.step_2}</li>
            <li>{PANIC_RESPONSE.step_3}</li>
          </ol>
          <Button variant="primary" size="sm" className="w-full" onClick={() => setCalmMode(false)}>
            Continue practice
          </Button>
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
      <OverlayKeyboardHandler enabled={phase === "active"} onToggleMute={audio.toggleMute} />

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
                onClick={() => setCalmMode(true)}
                leftIcon={<EyeOff className="w-3 h-3" />}
              >
                Calm steps
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
                    isListening ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30",
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
              <button
                type="button"
                onClick={audio.toggleMute}
                className="p-1.5 rounded-lg hover:bg-accent/10 transition-all"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <MicOff className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>
            </div>

            <div className="min-h-[60px] text-sm text-foreground leading-relaxed">
              {candidateTranscript || (
                <span className="text-muted-foreground italic">Start speaking…</span>
              )}
              {interimText && (
                <span className="text-muted-foreground italic"> {interimText}</span>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Conversation
              </p>
              <MockConversationPanel />
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
        onToggleMic={audio.toggleMute}
        onToggleSystemAudio={audio.toggleSystemAudio}
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
