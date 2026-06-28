// src/pages/app/mock/MockSession.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useAudioSession } from "@/hooks/useAudioSession";
import { useFillerWordDetection } from "@/hooks/useFillerWordDetection";
import { useWPMTracker } from "@/hooks/useWPMTracker";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useGamification } from "@/hooks/useGamification";
import { useOverlayStore } from "@/store/overlayStore";
import { useUIStore } from "@/store/uiStore";
import { useNetworkStore } from "@/store/networkStore";
import { networkMonitor } from "@/lib/network/networkMonitor";
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
import { getLocalMockQuestions } from "@/lib/mock/localQuestionBank";
import { isOverlayGhostClickSuppressed } from "@/lib/overlay/ghostClickGuard";
import { toDbModel } from "@/lib/ai/modelMapping";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
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
  CheckCircle,
  Clock,
  Coins,
  StickyNote,
  Pause,
  Play,
  BarChart2,
} from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  maxSessionSecondsForPlan,
  isFreePlan,
} from "@/lib/constants/freeTier";

type MockSessionPhase = "idle" | "configuring" | "active" | "completed";
type MockSetupStep = "session" | "questions" | "audio";

type MockConfig = LiveSessionConfig & {
  type?: string;
  count?: number;
  role?: string | null;
  question_count?: number;
};

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

interface MockSessionSummaryStats {
  questionsAnswered: number;
  timeTakenSeconds: number;
  creditsUsed: number;
  sessionId: string | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */

export default function MockSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const planId = profile?.plan_id ?? "free";
  const { checkPostSessionAchievements } = useGamification();

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

  const sessionConfigRef = useRef<LiveSessionConfig | null>(null);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  const audio = useAudioSession({
    enableSystemAudio: false,
    micOptional: true,
    micDeviceId,
    noiseSuppression,
    onQuestionDetected: () => {},
    onFillerDetected: (count) => useSessionStore.getState().setFillerCount(count),
    onWPMUpdate: (wpm) => useSessionStore.getState().setCurrentWPM(wpm),
  });

  const startTimeRef = useRef<string>(new Date().toISOString());

  const [phase, setPhase] = useState<MockSessionPhase>("idle");
  const [summaryStats, setSummaryStats] = useState<MockSessionSummaryStats | null>(null);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [calmMode, setCalmMode] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<MockSetupStep>("session");
  const [usedLocalQuestions, setUsedLocalQuestions] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  const questionsCacheRef = useRef<SessionQuestion[] | null>(null);
  const isStartingRef = useRef(false);
  const autoStartedRef = useRef(false);

  const SESSION_DURATION = maxSessionSecondsForPlan(planId);
  const [timerMode, setTimerMode] = useState<"countdown" | "countup">("countdown");
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_DURATION);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endCalledRef = useRef(false);

  const answersRef = useRef<QuestionAnswer[]>([]);
  const questionStartRef = useRef<number>(Date.now());

  const handleEndSessionRef = useRef<() => Promise<void>>();

  // Overlay mount/unmount behavior
  useEffect(() => {
    if (phase === "active") {
      const overlay = useOverlayStore.getState();
      overlay.setStealthMode(false);
      overlay.setMinimalMode(false);
      overlay.showOverlay();
    }
    return () => {
      useOverlayStore.getState().hideOverlay();
    };
  }, [phase]);

  // Timer
  useEffect(() => {
    if (phase !== "active" || isPaused) return;

    sessionTimerRef.current = setInterval(() => {
      if (timerMode === "countdown") {
        setSessionTimeLeft((t) => {
          if (t <= 1) {
            if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
            handleEndSessionRef.current?.();
            return 0;
          }
          return t - 1;
        });
      } else {
        setSessionElapsed((t) => t + 1);
      }
    }, 1000);

    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [phase, isPaused, timerMode]);

  const handleTogglePause = useCallback(async () => {
    if (phase !== "active") return;

    if (isPaused) {
      try {
        await audio.start();
        setIsPaused(false);
        toast.message("Session resumed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to resume recording");
      }
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      audio.stop();
      setIsPaused(true);
      toast.message("Session paused — timer and recording stopped");
    }
  }, [phase, isPaused, audio]);

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
    "ctrl+shift+c": () => {
      if (phase !== "active") return;
      const overlay = useOverlayStore.getState();
      overlay.is_visible ? overlay.hideOverlay() : overlay.showOverlay();
    },
    "ctrl+shift+p": () => {
      if (phase !== "active") return;
      setCalmMode((p) => !p);
    },
    "ctrl+shift+m": () => {
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
    timerMode === "countup"
      ? "emerald"
      : sessionTimeLeft > 120
        ? "emerald"
        : sessionTimeLeft > 30
          ? "amber"
          : "red";

  const timerDisplay =
    timerMode === "countup"
      ? formatDuration(sessionElapsed)
      : sessionTimeLeft <= 0
        ? "Saving..."
        : `${Math.floor(sessionTimeLeft / 60)}:${String(sessionTimeLeft % 60).padStart(2, "0")}`;

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

  function resolveMockConfigFields(config: MockConfig) {
    const interviewType = config.interview_type ?? config.type ?? "behavioural";
    const questionCount = config.question_count ?? config.count ?? 5;
    const role =
      config.role ??
      (config as { target_role?: string }).target_role ??
      profile?.target_role ??
      "";
    const company = config.company ?? "";

    return { interviewType, questionCount, role, company };
  }

  async function loadQuestions(
    dbSessionId: string,
    config: MockConfig,
    options?: { forceLocal?: boolean },
  ): Promise<void> {
    if (questionsCacheRef.current?.length) {
      orchestrator.setQuestions(questionsCacheRef.current);
      return;
    }

    setQuestionsError(null);
    const { interviewType, questionCount, role, company } = resolveMockConfigFields(config);

    if (!options?.forceLocal) {
      try {
        const data = await fetchEdgeJson<{ questions?: unknown[] }>("generate-questions", {
          type: interviewType,
          count: questionCount,
          interview_type: interviewType,
          question_count: questionCount,
          company,
          role,
          session_id: dbSessionId,
          free_session: true,
        });

        const raw =
          data?.questions ??
          (data as { data?: { questions?: unknown[] } })?.data?.questions ??
          [];

        if (Array.isArray(raw) && raw.length > 0) {
          orchestrator.setQuestions(raw);
          questionsCacheRef.current = useSessionStore.getState().questions;
          setUsedLocalQuestions(false);
          return;
        }
      } catch (err) {
        console.warn("[MockSession] AI question generation failed, using local bank:", err);
      }
    }

    const local = getLocalMockQuestions({
      type: interviewType,
      count: questionCount,
      company,
      role,
    });
    orchestrator.setQuestions(local);
    questionsCacheRef.current = useSessionStore.getState().questions;
    setUsedLocalQuestions(true);
    toast.message("Using built-in practice questions — AI generation was unavailable.");
  }

  async function handleSetup(config: LiveSessionConfig, existingSessionId?: string) {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setPhase("configuring");
    setSetupStep("session");
    setQuestionsError(null);
    setUsedLocalQuestions(false);

    sessionConfigRef.current = config;
    setMicDeviceId(config.mic_device_id ?? null);
    setNoiseSuppression(config.noise_suppression ?? true);
    startTimeRef.current = new Date().toISOString();
    endCalledRef.current = false;
    useAudioStore.getState().clearTranscript();

    const overlay = useOverlayStore.getState();
    overlay.resetSessionState();
    // Parakeet-style: always fully visible during mock — no discrete/stealth dimming.
    overlay.setStealthMode(false);
    overlay.setProctorSafe(false);
    overlay.setActiveModel(config.model);
    overlay.setHintStyle(config.hint_style);
    overlay.setAutoGenerate(false);
    overlay.setNetworkColor("green");
    useUIStore.getState().setStealthMode(false);
    useAudioStore.getState().setStreamError(null);
    useNetworkStore.getState().deactivateOfflineFallback();
    useNetworkStore.getState().setMode("strong");
    void networkMonitor.forceProbe();

    const userId = profile?.id;
    if (!userId) {
      toast.error("You must be signed in to start a session.");
      setPhase("idle");
      isStartingRef.current = false;
      return;
    }

    let dbSessionId: string | null = existingSessionId ?? null;
    try {
      if (dbSessionId) {
        await activateSession(dbSessionId);
      } else {
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
      }

      const mockConfig = config as MockConfig;
      const { interviewType, questionCount } = resolveMockConfigFields(mockConfig);

      await orchestrator.createSession({
        session_type: "mock",
        interview_type: interviewType,
        question_count: questionCount,
        hint_style: config.hint_style,
        model: config.model,
        resume_id: config.resume_id,
        jd_id: config.jd_id,
        session_id: dbSessionId,
      });

      setSetupStep("questions");
      await loadQuestions(dbSessionId, mockConfig);
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
      setSetupStep("audio");
      await audio.start();
      setSessionTimeLeft(SESSION_DURATION);
      setSessionElapsed(0);
      setIsPaused(false);
      setPhase("active");
      overlay.showOverlay();
    } catch (err) {
      console.error("[MockSession] audio start failed:", err);
      // micOptional allows text-only mock — still enter active session.
      toast.warning("Mic unavailable — continuing with overlay chat and hints.");
      useAudioStore.getState().setStreamError(null);
      setSessionTimeLeft(SESSION_DURATION);
      setSessionElapsed(0);
      setIsPaused(false);
      setPhase("active");
      overlay.showOverlay();
    } finally {
      isStartingRef.current = false;
    }
  }

  useEffect(() => {
    const routeState = location.state as {
      config?: LiveSessionConfig;
      sessionId?: string;
    } | null;
    const configFromRoute = routeState?.config;
    const sessionIdFromRoute = routeState?.sessionId;

    if (!configFromRoute || autoStartedRef.current || phase !== "idle") return;
    if (!profile?.id) return;

    autoStartedRef.current = true;
    void handleSetup(configFromRoute, sessionIdFromRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, phase, profile?.id]);

  async function finalizeSession(skipCapture = false) {
    if (endCalledRef.current) return;
    endCalledRef.current = true;

    if (!skipCapture) captureAnswer();
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    audio.stop();
    useOverlayStore.getState().hideOverlay();

    const startedMs = startTimeRef.current
      ? new Date(startTimeRef.current).getTime()
      : Date.now();
    const timeTakenSeconds = Math.max(1, Math.round((Date.now() - startedMs) / 1000));
    const questionsAnswered = answersRef.current.filter((a) => !a.skipped).length;
    const creditsUsed = useSessionStore.getState().credits_consumed;
    const sessionId = useSessionStore.getState().session_id;

    setSummaryStats({
      questionsAnswered,
      timeTakenSeconds,
      creditsUsed,
      sessionId,
    });
    setPhase("completed");
    setIsSavingSummary(true);

    try {
      await persistMockSession();
      await orchestrator.completeSession();

      const userId = profile?.id;
      const sessionId = useSessionStore.getState().session_id;
      if (userId) {
        const totalSessions = await sessionsDB.countCompletedByUserId(userId);
        await checkPostSessionAchievements({
          sessionType: "mock",
          sessionId: sessionId ?? undefined,
          totalSessions,
          durationMinutes: Math.round(timeTakenSeconds / 60),
          fillerWordCount: fillerHook.totalCount,
        });
      }
    } finally {
      setIsSavingSummary(false);
    }
  }

  async function handleNextQuestion() {
    if (isLastQ) {
      await finalizeSession();
    } else {
      captureAnswer();
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
        notes: sessionNotes.trim() || transcript || null,
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
    if (isOverlayGhostClickSuppressed()) return;
    await finalizeSession();
  }

  useEffect(() => {
    handleEndSessionRef.current = handleEndSession;
  });

  const micLevel = audio.currentLevel;

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
    const setupLabel =
      setupStep === "session"
        ? "Preparing session…"
        : setupStep === "questions"
          ? usedLocalQuestions
            ? "Loading practice questions…"
            : "Generating questions…"
          : "Starting microphone…";

    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium text-foreground">{setupLabel}</p>
            <p className="text-xs text-muted-foreground">
              {setupStep === "audio"
                ? "Allow microphone access when prompted"
                : "Preparing your mock interview session"}
            </p>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full rounded-xl" />
          {questionsError && (
            <InlineErrorRetry
              message={questionsError}
              onRetry={() => {
                const cfg = sessionConfigRef.current as MockConfig | null;
                const sid = useSessionStore.getState().session_id;
                if (!cfg || !sid) {
                  setPhase("idle");
                  autoStartedRef.current = false;
                  return;
                }
                setQuestionsError(null);
                isStartingRef.current = true;
                setSetupStep("questions");
                void loadQuestions(sid, cfg, { forceLocal: true })
                  .then(() => {
                    setSetupStep("audio");
                    return audio.start();
                  })
                  .then(() => {
                    setPhase("active");
                    useOverlayStore.getState().showOverlay();
                  })
                  .catch((err: unknown) => {
                    setQuestionsError(
                      err instanceof Error ? err.message : "Retry failed",
                    );
                  })
                  .finally(() => {
                    isStartingRef.current = false;
                  });
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (phase === "completed" && summaryStats) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md space-y-5 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Session complete</h2>
            <p className="text-sm text-muted-foreground">
              {isSavingSummary ? "Saving your session…" : "Your mock interview has been saved."}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-left">
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Answered
              </p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {summaryStats.questionsAnswered}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Time
              </p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {formatDuration(summaryStats.timeTakenSeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Coins className="w-3 h-3" />
                Credits
              </p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {summaryStats.creditsUsed}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {summaryStats.sessionId ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  disabled={isSavingSummary}
                  onClick={() => navigate(`/app/debrief/${summaryStats.sessionId}`)}
                  leftIcon={<BarChart2 className="w-4 h-4" />}
                >
                  Go to Analytics
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  disabled={isSavingSummary}
                  onClick={() => navigate(`/app/scorecard/${summaryStats.sessionId}`)}
                >
                  View scorecard
                </Button>
              </>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              disabled={isSavingSummary}
              onClick={() => navigate("/app/sessions")}
            >
              Back to sessions
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Wrapping up…</p>
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
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading question…</p>
        </div>
      </div>
    );
  }

  const questionText = typeof question === "string" ? question : question?.question_text ?? "";

  const isListeningActive =
    !isPaused && isCapturing && (deepgramStatus === "connected" || deepgramStatus === "reconnecting");

  return (
    <div className="min-h-screen max-h-screen overflow-y-auto bg-background text-foreground">
      <LiveSessionController isActive={true} />
      <OverlayKeyboardHandler enabled={phase === "active"} onToggleMute={audio.toggleMute} />

      <div className="flex min-h-screen">
        {/* T-0266 — note-taking sidebar */}
        <aside className="hidden lg:flex w-72 shrink-0 border-r border-border bg-card/50 flex-col p-4">
          <div className="flex items-center gap-2 mb-3">
            <StickyNote className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Session notes</h2>
          </div>
          <textarea
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Jot down key points, follow-ups, or reminders…"
            className="flex-1 min-h-[200px] resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </aside>

        {/* Main UI */}
        <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-4 sm:space-y-6 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">
                Question <span className="text-foreground font-bold">{qIndex + 1}</span> / {totalQ}
              </span>
              <Badge variant="primary" size="sm">
                mock
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {isPaused && (
                <Badge variant="amber" size="sm">Paused</Badge>
              )}
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void handleTogglePause()}
                leftIcon={isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              >
                {isPaused ? "Resume" : "Pause"}
              </Button>
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
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums",
                    timerMode === "countup" || sessionTimeLeft > 0
                      ? timeColor === "emerald"
                        ? "text-emerald-400"
                        : timeColor === "amber"
                          ? "text-amber-400"
                          : "text-red-400"
                      : "text-muted-foreground",
                  )}
                >
                  <Timer className="w-3.5 h-3.5" />
                  {timerDisplay}
                </div>
                <div className="flex rounded-lg border border-border overflow-hidden text-[10px]">
                  <button
                    type="button"
                    onClick={() => setTimerMode("countdown")}
                    className={cn(
                      "px-2 py-0.5 transition-colors",
                      timerMode === "countdown"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Countdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimerMode("countup")}
                    className={cn(
                      "px-2 py-0.5 transition-colors",
                      timerMode === "countup"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Count up
                  </button>
                </div>
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
                    isListeningActive ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30",
                  )}
                />
                <span className="text-xs font-medium text-foreground">
                  {isPaused ? "Recording paused" : "Your answer"}
                </span>
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
              <div className="flex items-center gap-2">
                {!isMuted && isCapturing && (
                  <div className="w-16 hidden sm:block">
                    <ProgressBar
                      value={micLevel}
                      max={100}
                      color={micLevel > 80 ? "red" : micLevel > 30 ? "emerald" : "amber"}
                      size="sm"
                    />
                  </div>
                )}
                <label className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noiseSuppression}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setNoiseSuppression(enabled);
                      void audio.setNoiseSuppression?.(enabled);
                    }}
                    className="rounded border-border"
                  />
                  Noise supp.
                </label>
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

          <div className="lg:hidden rounded-2xl border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground">Session notes</p>
            </div>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="Jot down key points…"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <p className="text-center text-xs text-muted-foreground/40">
            The overlay window provides AI hints, transcript, and session status. Use{" "}
            <kbd className="px-1 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+H</kbd> or{" "}
            <kbd className="px-1 py-0.5 bg-secondary rounded font-mono">Ctrl+Shift+C</kbd> to toggle it.
          </p>
        </div>
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
                void finalizeSession(true);
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
