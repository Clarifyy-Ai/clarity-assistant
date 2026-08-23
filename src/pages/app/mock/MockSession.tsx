// src/pages/app/mock/MockSession.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
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
import { parsePrivacyPrefs } from "@/lib/privacy/privacyPrefs";
import { useAudioStore } from "@/store/audioStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { OverlayKeyboardHandler } from "@/components/overlay/OverlayKeyboardHandler";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { PostSessionSummary } from "@/components/session/PostSessionSummary";
import { setGenerateAnswerHandler } from "@/lib/overlay/hotkeys";
import { saveLastSessionSummary } from "@/lib/session/lastSessionSummary";
import {
  sessionsDB,
  sessionTranscriptsDB,
  sessionAnswersDB,
  resumesDB,
  jobDescriptionsDB,
} from "@/lib/supabase/database";
import { useDocumentStore } from "@/store/documentStore";
import { getOrCreateSession, activateSession, isServerExpired } from "@/lib/session/sessionLifecycle";
import { sessionDurationSeconds as sharedSessionDurationSeconds } from "@/lib/session/sessionStartEligibility";
import { handleSessionStartError } from "@/lib/billing/sessionStartErrors";
import {
  createMockQuestionOperationId,
  generateMockInterviewQuestion,
  QUESTION_GENERATION_USER_ERROR,
} from "@/lib/mock/generateMockQuestion";
import {
  createQuestionGenerationSnapshot,
  isQuestionGenerationInFlight,
  reduceQuestionGeneration,
  type QuestionGenerationSnapshot,
} from "@/lib/mock/questionGenerationFsm";
import {
  assertMockSessionAllowsUpdate,
  isMockSessionMutable,
  reduceMockSessionLifecycle,
  type MockSessionLifecycle,
} from "@/lib/mock/mockSessionLifecycle";
import { speakQuestionText, stopBrowserTts } from "@/lib/mock/mockTts";
import { getAiUserFacingError } from "@/lib/network/aiErrorUx";
import { isOverlayGhostClickSuppressed } from "@/lib/overlay/ghostClickGuard";
import { toDbModel } from "@/lib/ai/modelMapping";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { PANIC_RESPONSE } from "@/types/session.types";
import type { LiveSessionConfig, SessionQuestion } from "@/types/session.types";
import type { PreferredAIModel } from "@/types/user.types";
import type { Tables } from "@/integrations/supabase";
import {
  Mic,
  MicOff,
  Square,
  ChevronRight,
  SkipForward,
  Eye,
  EyeOff,
  Timer,
  RefreshCw,
  CheckCircle,
  Clock,
  Coins,
  Pause,
  Play,
  BarChart2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  maxSessionSecondsForPlan,
} from "@/lib/constants/freeTier";

type MockSessionPhase = "idle" | "configuring" | "active" | "completed";
type MockSetupStep = "session" | "questions" | "audio";
type OverlayInitState = "waiting_session" | "initializing" | "ready" | "error" | "ended";

type MockConfig = LiveSessionConfig & {
  type?: string;
  count?: number;
  role?: string | null;
  question_count?: number;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
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
  /** True when session ended with no scored answers — no fake 0 scorecard. */
  incompleteNoAnswers?: boolean;
}

const INCOMPLETE_NO_ANSWERS_NOTE = "not_scored";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function parseMockCompanyFromTitle(title: string | null): string | null {
  if (!title) return null;
  const prefix = "Mock — ";
  if (title.startsWith(prefix)) return title.slice(prefix.length);
  return null;
}

function buildConfigFromSessionRow(
  session: Tables<"sessions">,
  profile: { target_role?: string | null } | null,
): LiveSessionConfig {
  const questionCount = session.questions_asked ?? 5;
  const interviewType = "behavioural";
  const model = (session.model_used as PreferredAIModel | null) ?? "gemini-flash";

  return {
    company: parseMockCompanyFromTitle(session.title),
    role: profile?.target_role ?? null,
    hint_style: "short_hints",
    model,
    smart_routing: true,
    stealth_mode: false,
    resume_id: session.document_id ?? null,
    jd_id: session.jd_id ?? null,
    interview_type: interviewType,
    instructions: "",
    enable_system_audio: true,
  };
}

function pickJdText(row: Record<string, unknown> | null): string {
  if (!row) return "";
  for (const key of ["description", "content", "text", "raw_text"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function loadResumeContextText(config: MockConfig): Promise<string> {
  const active = useDocumentStore.getState().active_context.resume;
  const fromActive = typeof active?.content === "string" ? active.content.trim() : "";
  if (fromActive) return fromActive;

  if (!config.resume_id) return "";
  try {
    const row = await resumesDB.getByIdMaybe(config.resume_id);
    return row?.content?.trim() ?? "";
  } catch (err) {
    console.warn("[MockSession] resume load failed:", err);
    return "";
  }
}

async function loadJobDescriptionText(config: MockConfig): Promise<string> {
  if (!config.jd_id) return "";
  try {
    const jd = await jobDescriptionsDB.getByIdMaybe(config.jd_id);
    return pickJdText(jd as Record<string, unknown> | null);
  } catch (err) {
    console.warn("[MockSession] JD load failed:", err);
    return "";
  }
}

function sessionDurationSeconds(session: Tables<"sessions">): number {
  return sharedSessionDurationSeconds(session);
}

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */

export default function MockSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
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
  const isMobile = useIsMobile();
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
  const sessionIdFromStore = useSessionStore((s) => s.session_id);

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
  const [targetQuestionCount, setTargetQuestionCount] = useState(5);
  const [generationSnap, setGenerationSnap] = useState<QuestionGenerationSnapshot>(
    () => createQuestionGenerationSnapshot(),
  );
  const [nextQuestionError, setNextQuestionError] = useState<string | null>(null);
  const [overlayInitState, setOverlayInitState] = useState<OverlayInitState>("waiting_session");

  const questionsCacheRef = useRef<SessionQuestion[] | null>(null);
  const isStartingRef = useRef(false);
  const autoStartedRef = useRef(false);
  const lifecycleRef = useRef<MockSessionLifecycle>("ACTIVE");
  const generationAbortRef = useRef<AbortController | null>(null);
  const activeOperationIdRef = useRef<string | null>(null);
  const speakingQuestionIdRef = useRef<string | null>(null);
  const overlayMountedSessionRef = useRef<string | null>(null);

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

  const clearSessionTimers = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  const abortInFlightGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    activeOperationIdRef.current = null;
    setGenerationSnap((s) => reduceQuestionGeneration(s, { type: "CANCEL" }));
  }, []);

  // Overlay mount only after session context is ready — one instance per session.
  useEffect(() => {
    const sessionId = useSessionStore.getState().session_id;
    if (phase === "active" && sessionId && isMockSessionMutable(lifecycleRef.current)) {
      if (overlayMountedSessionRef.current !== sessionId) {
        overlayMountedSessionRef.current = sessionId;
        const overlay = useOverlayStore.getState();
        overlay.setMinimalMode(false);
        overlay.setActiveTab("transcript");
        overlay.showOverlay();
        setOverlayInitState("ready");
      }
    }
    if (phase === "completed" || phase === "idle") {
      useOverlayStore.getState().hideOverlay();
      overlayMountedSessionRef.current = null;
      setOverlayInitState(phase === "completed" ? "ended" : "waiting_session");
    }
    return () => {
      if (phase !== "active") {
        useOverlayStore.getState().hideOverlay();
      }
    };
  }, [phase]);

  // Timer — never fires updates once lifecycle is terminal.
  useEffect(() => {
    if (phase !== "active" || isPaused) return;
    if (!isMockSessionMutable(lifecycleRef.current)) return;

    sessionTimerRef.current = setInterval(() => {
      if (!isMockSessionMutable(lifecycleRef.current)) {
        clearSessionTimers();
        return;
      }
      if (timerMode === "countdown") {
        setSessionTimeLeft((t) => {
          if (t <= 1) {
            clearSessionTimers();
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
      clearSessionTimers();
    };
  }, [phase, isPaused, timerMode, clearSessionTimers]);

  const handleTogglePause = useCallback(async () => {
    if (phase !== "active") return;

    if (isPaused) {
      try {
        await audio.start();
        setIsPaused(false);
        toast.message("Session resumed");
      } catch (err) {
        toast.error(getAiUserFacingError(err));
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
      if (!isMockSessionMutable(lifecycleRef.current)) return;
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
    if (!isMockSessionMutable(lifecycleRef.current)) return;
    fillerHook.reset();
    wpmHook.reset();
    questionStartRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator.currentQuestionIndex]);

  // Next-question only — overlay H/P/M are OverlayKeyboardHandler (avoid double-toggle).
  useHotkeys({
    "ctrl+shift+n": () => {
      if (phase !== "active") return;
      if (!isMockSessionMutable(lifecycleRef.current)) return;
      if (isQuestionGenerationInFlight(generationSnap.state)) return;
      setSkipConfirm(true);
    },
  });

  const question = orchestrator.currentQuestion;
  const qIndex = orchestrator.currentQuestionIndex ?? 0;
  const totalQ = targetQuestionCount;
  const isLastQ = qIndex >= totalQ - 1;
  const generationInFlight = isQuestionGenerationInFlight(generationSnap.state);

  const handleRequestHint = useCallback(async (questionText?: string) => {
    if (!isMockSessionMutable(lifecycleRef.current)) return;
    const overlay = useOverlayStore.getState();
    overlay.setActiveTab("answer");
    overlay.setMinimalMode(false);
    const q = questionText || (typeof question === "string" ? question : question?.question_text);
    if (q) {
      overlay.setCurrentQuestion(q);
      await orchestrator.requestHint(q);
    }
  }, [question, orchestrator]);

  useEffect(() => {
    if (phase !== "active") return;
    setGenerateAnswerHandler(() => {
      void handleRequestHint();
    });
    return () => setGenerateAnswerHandler(null);
  }, [phase, handleRequestHint]);

  useEffect(() => {
    if (phase !== "active" || !question) return;
    if (!isMockSessionMutable(lifecycleRef.current)) return;

    const qText = typeof question === "string" ? question : question.question_text ?? "";
    const qId =
      typeof question === "string"
        ? `q-${qIndex}`
        : question.id || `q-${qIndex}`;

    if (qText) {
      injectInterviewerQuestion(qText, qIndex);
      useOverlayStore.getState().setCurrentQuestion(qText);
      if (useOverlayStore.getState().auto_generate) {
        void handleRequestHint(qText);
      }
      speakingQuestionIdRef.current = qId;
      speakQuestionText(qText, {
        questionId: qId,
        isCurrent: (id) =>
          speakingQuestionIdRef.current === id &&
          isMockSessionMutable(lifecycleRef.current),
      });
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
    const existingIdx = answersRef.current.findIndex((a) => a.question_index === qIndex);
    const entry: QuestionAnswer = {
      question_text: qText,
      answer_text: skipped ? "" : candidateTranscript,
      question_index: qIndex,
      skipped,
      filler_count: fillerHook.totalCount ?? 0,
      wpm: wpmHook.wpm ?? 0,
      duration_seconds: elapsed,
      timestamp: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      answersRef.current[existingIdx] = entry;
    } else {
      answersRef.current.push(entry);
    }
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
    const difficulty = config.difficulty ?? "medium";

    return { interviewType, questionCount, role, company, difficulty };
  }

  async function runQuestionGeneration(options: {
    dbSessionId: string;
    config: MockConfig;
    questionNumber: number;
    usedTexts: string[];
    forceFallback?: boolean;
  }): Promise<SessionQuestion> {
    const { interviewType, role, company, difficulty } = resolveMockConfigFields(
      options.config,
    );
    const operationId = createMockQuestionOperationId(
      options.dbSessionId,
      options.questionNumber,
    );

    if (activeOperationIdRef.current) {
      throw new Error("A question is already being generated.");
    }

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    activeOperationIdRef.current = operationId;

    setNextQuestionError(null);
    setGenerationSnap((s) =>
      reduceQuestionGeneration(s, { type: "START", operationId }),
    );
    setGenerationSnap((s) =>
      reduceQuestionGeneration(s, { type: "BEGIN_PROVIDER" }),
    );

    try {
      const [resume_context, job_description] = await Promise.all([
        loadResumeContextText(options.config),
        loadJobDescriptionText(options.config),
      ]);

      if (
        !assertMockSessionAllowsUpdate(
          lifecycleRef.current,
          options.dbSessionId,
          useSessionStore.getState().session_id,
        )
      ) {
        throw new DOMException("Aborted", "AbortError");
      }

      const result = await generateMockInterviewQuestion({
        type: interviewType,
        count: 1,
        difficulty,
        company,
        role,
        session_id: options.dbSessionId,
        resume_context,
        job_description,
        free_session: true,
        exclude_questions: options.usedTexts,
        allow_fallback: true,
        questionNumber: options.questionNumber,
        usedTexts: options.usedTexts,
        signal: controller.signal,
        idempotencyKey: operationId,
        forceFallback: options.forceFallback,
      });

      if (controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (
        !assertMockSessionAllowsUpdate(
          lifecycleRef.current,
          options.dbSessionId,
          useSessionStore.getState().session_id,
        )
      ) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (activeOperationIdRef.current !== operationId) {
        throw new DOMException("Aborted", "AbortError");
      }

      setUsedLocalQuestions(result.source === "fallback");
      setGenerationSnap((s) =>
        reduceQuestionGeneration(s, {
          type: "SUCCESS",
          source: result.source,
        }),
      );
      return result.question;
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        !isMockSessionMutable(lifecycleRef.current)
      ) {
        setGenerationSnap((s) =>
          reduceQuestionGeneration(s, { type: "CANCEL" }),
        );
        throw err;
      }
      setGenerationSnap((s) =>
        reduceQuestionGeneration(s, {
          type: "FAIL",
          code: "QUESTION_GENERATION_UNAVAILABLE",
        }),
      );
      throw err;
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
      if (activeOperationIdRef.current === operationId) {
        activeOperationIdRef.current = null;
      }
    }
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
    const { questionCount } = resolveMockConfigFields(config);
    setTargetQuestionCount(questionCount);
    setOverlayInitState("initializing");

    try {
      const first = await runQuestionGeneration({
        dbSessionId,
        config,
        questionNumber: 1,
        usedTexts: [],
        forceFallback: options?.forceLocal,
      });
      if (!isMockSessionMutable(lifecycleRef.current) && phase !== "configuring") {
        return;
      }
      orchestrator.setQuestions([first]);
      questionsCacheRef.current = useSessionStore.getState().questions;
      if (useSessionStore.getState().questions[0]?.tags?.includes("fallback_bank")) {
        toast.message("Using built-in practice questions — AI generation was unavailable.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[MockSession] question generation failed:", err);
      const message =
        err instanceof Error && err.message.includes("couldn't generate")
          ? err.message
          : QUESTION_GENERATION_USER_ERROR;
      setQuestionsError(message);
      throw new Error(message);
    }
  }

  async function handleSetup(config: LiveSessionConfig, existingSessionId?: string) {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setPhase("configuring");
    setSetupStep("session");
    setQuestionsError(null);
    setNextQuestionError(null);
    setUsedLocalQuestions(false);
    setOverlayInitState("initializing");
    lifecycleRef.current = "ACTIVE";
    abortInFlightGeneration();
    setGenerationSnap(createQuestionGenerationSnapshot());
    questionsCacheRef.current = null;
    speakingQuestionIdRef.current = null;

    sessionConfigRef.current = config;
    setMicDeviceId(config.mic_device_id ?? null);
    setNoiseSuppression(config.noise_suppression ?? true);
    startTimeRef.current = new Date().toISOString();
    endCalledRef.current = false;
    useAudioStore.getState().clearTranscript();

    const overlay = useOverlayStore.getState();
    overlay.resetSessionState();
    // Apply user's stealth preference from setup config.
    overlay.setStealthMode(config.stealth_mode ?? false);
    overlay.setProctorSafe(false);
    overlay.setActiveModel(config.model);
    overlay.setHintStyle(config.hint_style);
    overlay.setAutoGenerate(false);
    overlay.setNetworkColor("green");
    useUIStore.getState().setStealthMode(config.stealth_mode ?? false);
    useAudioStore.getState().setStreamError(null);
    useNetworkStore.getState().deactivateOfflineFallback();
    useNetworkStore.getState().setMode("strong");
    void networkMonitor.forceProbe();

    const userId = profile?.id;
    if (!userId) {
      toast.error("You must be signed in to start a session.");
      isStartingRef.current = false;
      autoStartedRef.current = false;
      navigate("/app/mock");
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

      if (dbSessionId) {
        navigate(`/app/mock/session/${dbSessionId}`, { replace: true, state: location.state });
      }

      const mockConfig = config as MockConfig;
      const { interviewType, questionCount } = resolveMockConfigFields(mockConfig);
      setTargetQuestionCount(questionCount);

      await orchestrator.createSession({
        session_type: "mock",
        interview_type: interviewType,
        question_count: questionCount,
        hint_style: config.hint_style,
        model: config.model,
        resume_id: config.resume_id,
        jd_id: config.jd_id,
        session_id: dbSessionId,
        role: config.role,
        company: config.company,
      });

      setSetupStep("questions");
      await loadQuestions(dbSessionId!, mockConfig);
    } catch (err) {
      console.error("[MockSession] setup failed:", err);
      if (handleSessionStartError(err)) {
        isStartingRef.current = false;
        setPhase("idle");
        navigate("/app/mock");
        return;
      }
      const message = getAiUserFacingError(err);
      setQuestionsError(
        message.includes("502") || message.includes("503")
          ? QUESTION_GENERATION_USER_ERROR
          : message,
      );
      setOverlayInitState("error");
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
      setOverlayInitState("ready");
      useOverlayStore.getState().showOverlay();
    } catch (err) {
      console.error("[MockSession] audio start failed:", err);
      // micOptional allows text-only mock — still enter active session.
      toast.warning("Mic unavailable — continuing with overlay chat and hints.");
      useAudioStore.getState().setStreamError(null);
      setSessionTimeLeft(SESSION_DURATION);
      setSessionElapsed(0);
      setIsPaused(false);
      setPhase("active");
      setOverlayInitState("ready");
      useOverlayStore.getState().showOverlay();
    } finally {
      isStartingRef.current = false;
    }
  }

  useEffect(() => {
    const routeState = location.state as {
      config?: LiveSessionConfig;
      sessionId?: string;
    } | null;
    const sessionIdFromRoute = sessionIdParam ?? routeState?.sessionId;
    let configFromRoute = routeState?.config;
    if (!configFromRoute && sessionIdFromRoute) {
      try {
        const raw = sessionStorage.getItem(`clarify:mock-config:${sessionIdFromRoute}`);
        if (raw) configFromRoute = JSON.parse(raw) as LiveSessionConfig;
      } catch {
        // Fall back to the persisted database session below.
      }
    }

    if (autoStartedRef.current || phase !== "idle") return;

    if (!configFromRoute && !sessionIdFromRoute) {
      navigate("/app/mock", { replace: true });
      return;
    }

    if (!profile?.id) return;

    autoStartedRef.current = true;

    if (configFromRoute) {
      void handleSetup(configFromRoute, sessionIdFromRoute);
      return;
    }

    void (async () => {
      try {
        const session = await sessionsDB.getByIdForUser(sessionIdFromRoute!, profile.id);
        if (!session) {
          toast.error("Session not found");
          autoStartedRef.current = false;
          navigate("/app/mock");
          return;
        }
        if (session.type !== "mock") {
          toast.error("This link is not a mock session");
          autoStartedRef.current = false;
          navigate("/app/mock");
          return;
        }
        if (session.status === "completed") {
          setSummaryStats({
            questionsAnswered: session.answers_generated ?? 0,
            timeTakenSeconds: sessionDurationSeconds(session),
            creditsUsed: session.credits_used ?? 0,
            sessionId: session.id,
          });
          setPhase("completed");
          return;
        }
        if (session.status === "abandoned" || isServerExpired(session)) {
          if (isServerExpired(session) || session.lifecycle_status === "EXPIRED") {
            setSummaryStats({
              questionsAnswered: session.answers_generated ?? 0,
              timeTakenSeconds: sessionDurationSeconds(session),
              creditsUsed: session.credits_used ?? 0,
              sessionId: session.id,
            });
            setPhase("completed");
            toast.message("This practice session has expired and can no longer accept new actions.");
            return;
          }
          toast.message("Previous session was abandoned — configure a new mock session.");
          autoStartedRef.current = false;
          navigate("/app/mock");
          return;
        }
        const config = buildConfigFromSessionRow(session, profile);
        await handleSetup(config, session.id);
      } catch (err) {
        console.error("[MockSession] failed to restore session:", err);
        toast.error(getAiUserFacingError(err));
        autoStartedRef.current = false;
        navigate("/app/mock");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, phase, profile?.id, sessionIdParam]);

  async function finalizeSession(skipCapture = false) {
    if (endCalledRef.current) return;
    endCalledRef.current = true;

    // ACTIVE → ENDING → ENDED (terminal)
    lifecycleRef.current = reduceMockSessionLifecycle(lifecycleRef.current, {
      type: "BEGIN_END",
    });
    setOverlayInitState("ended");
    abortInFlightGeneration();
    orchestrator.cancelHintRequest();
    speakingQuestionIdRef.current = null;
    stopBrowserTts();
    clearSessionTimers();

    if (!skipCapture) {
      try {
        captureAnswer();
      } catch {
        /* ignore */
      }
    }

    audio.stop();
    useOverlayStore.getState().hideOverlay();
    overlayMountedSessionRef.current = null;
    lifecycleRef.current = reduceMockSessionLifecycle(lifecycleRef.current, {
      type: "CONFIRM_ENDED",
    });

    const startedMs = startTimeRef.current
      ? new Date(startTimeRef.current).getTime()
      : Date.now();
    const timeTakenSeconds = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
    const questionsAnswered = answersRef.current.filter(
      (a) => !a.skipped && (a.answer_text ?? "").trim().length > 0,
    ).length;
    const creditsUsed = useSessionStore.getState().credits_consumed;
    const sessionId = useSessionStore.getState().session_id;
    const hintsUsed = useOverlayStore.getState().hint_history.length;
    const incompleteNoAnswers = questionsAnswered === 0;

    if (sessionId) {
      saveLastSessionSummary({
        sessionId,
        durationSeconds: timeTakenSeconds,
        questionsDetected: questionsAnswered,
        hintsUsed,
        endedAt: Date.now(),
      });
    }

    setSummaryStats({
      questionsAnswered,
      timeTakenSeconds,
      creditsUsed,
      sessionId,
      incompleteNoAnswers,
    });
    setPhase("completed");
    setIsSavingSummary(true);

    try {
      await persistMockSession({ incompleteNoAnswers });
      await orchestrator.completeSession();

      const userId = profile?.id;
      const sid = useSessionStore.getState().session_id;
      if (userId && !incompleteNoAnswers) {
        const totalSessions = await sessionsDB.countCompletedByUserId(userId);
        await checkPostSessionAchievements({
          sessionType: "mock",
          sessionId: sid ?? undefined,
          totalSessions,
          durationMinutes: Math.round(timeTakenSeconds / 60),
          fillerWordCount: fillerHook.totalCount,
        });
      }
    } finally {
      setIsSavingSummary(false);
    }
  }

  async function handleNextQuestion(options?: { skipCapture?: boolean }) {
    if (!isMockSessionMutable(lifecycleRef.current)) return;
    if (generationInFlight) return;
    if (isOverlayGhostClickSuppressed()) return;

    if (isLastQ) {
      await finalizeSession(options?.skipCapture);
      return;
    }

    if (!options?.skipCapture) {
      captureAnswer();
    }
    setNextQuestionError(null);

    const sessionId = useSessionStore.getState().session_id;
    const cfg = sessionConfigRef.current as MockConfig | null;
    if (!sessionId || !cfg) {
      setNextQuestionError(QUESTION_GENERATION_USER_ERROR);
      return;
    }

    const usedTexts = useSessionStore
      .getState()
      .questions.map((q) => q.question_text)
      .filter(Boolean);
    const nextNumber = qIndex + 2;

    try {
      const nextQ = await runQuestionGeneration({
        dbSessionId: sessionId,
        config: cfg,
        questionNumber: nextNumber,
        usedTexts,
      });

      if (!isMockSessionMutable(lifecycleRef.current)) return;
      if (useSessionStore.getState().session_id !== sessionId) return;

      orchestrator.appendAndActivateQuestion(nextQ);
      questionsCacheRef.current = useSessionStore.getState().questions;
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        !isMockSessionMutable(lifecycleRef.current)
      ) {
        return;
      }
      console.warn("[MockSession] next question generation failed:", err);
      setNextQuestionError(QUESTION_GENERATION_USER_ERROR);
      toast.error(QUESTION_GENERATION_USER_ERROR);
    }
  }

  async function retryNextQuestion() {
    if (!isMockSessionMutable(lifecycleRef.current)) return;
    if (generationInFlight) return;
    setNextQuestionError(null);
    // Answer already captured on the failed Next — do not double-capture.
    await handleNextQuestion({ skipCapture: true });
  }

  async function persistMockSession(opts?: { incompleteNoAnswers?: boolean }) {
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
      const startedMs = startTimeRef.current
        ? new Date(startTimeRef.current).getTime()
        : Date.now();
      const duration_seconds = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
      const answeredCount = answersRef.current.filter((a) => !a.skipped).length;
      const incompleteNoAnswers = opts?.incompleteNoAnswers ?? answeredCount === 0;

      const existingNotes = sessionNotes.trim();
      const persistTranscripts = parsePrivacyPrefs(profile?.privacy_prefs).store_transcripts;
      const notesParts = [
        incompleteNoAnswers ? INCOMPLETE_NO_ANSWERS_NOTE : null,
        existingNotes || null,
        persistTranscripts && !incompleteNoAnswers ? transcript || null : null,
      ].filter(Boolean);

      // Server finalization owns status / ended_at / terminal_reason /
      // duration_seconds. Only fall back to a local terminal write when the
      // server round-trip fails, and tell the user it degraded.
      let endedByRpc = false;
      try {
        const { endSession } = await import("@/lib/api/sessions");
        await endSession({
          session_id: sessionId,
          terminal_reason: incompleteNoAnswers ? "CANCELLED" : "USER_ENDED",
        });
        endedByRpc = true;
      } catch (err) {
        console.error("[MockSession] end-session failed:", err);
        endedByRpc = false;
        toast.error(
          "We couldn't confirm the end of this session with the server. Your results were saved locally.",
        );
      }

      await sessionsDB.update(sessionId, {
        ...(endedByRpc
          ? {}
          : {
              status: incompleteNoAnswers ? "abandoned" : "completed",
              ended_at: new Date().toISOString(),
              duration_seconds,
              terminal_reason: incompleteNoAnswers ? "CANCELLED" : "USER_ENDED",
              lifecycle_status: incompleteNoAnswers ? "CANCELLED" : "COMPLETED",
            }),
        credits_used: session.credits_consumed,
        model_used: dbModel as any,
        filler_words: fillerHook.totalCount,
        avg_wpm: wpmHook.wpm,
        hints_used: overlay.hint_history.length,
        answers_generated: answeredCount,
        questions_asked: targetQuestionCount,
        ...(incompleteNoAnswers ? { overall_score: null } : {}),
        notes: notesParts.length > 0 ? notesParts.join("\n") : null,
        session_type: "mock",
      } as any);

      if (transcript && !incompleteNoAnswers && persistTranscripts) {
        await sessionTranscriptsDB.create({
          session_id: sessionId,
          user_id: userId,
          transcript,
          utterances,
        });
      }

      const scoredAnswers = answersRef.current.filter(
        (a) => !a.skipped && (a.answer_text ?? "").trim().length > 0,
      );
      if (scoredAnswers.length > 0) {
        await sessionAnswersDB.createMany(
          scoredAnswers.map((a) => ({
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
      toast.error("Could not save this session. Your practice ran, but the scorecard may be missing.");
    }
  }

  async function handleEndSession() {
    if (isOverlayGhostClickSuppressed()) return;
    await finalizeSession();
  }

  useEffect(() => {
    handleEndSessionRef.current = handleEndSession;
  });

  if (phase === "idle") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Preparing session…</p>
        </div>
      </div>
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
                    setQuestionsError(getAiUserFacingError(err));
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

  if (phase === "completed" && summaryStats?.sessionId) {
    if (summaryStats.incompleteNoAnswers) {
      return (
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="w-full max-w-md space-y-5 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-foreground">Session incomplete</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-normal">
                No answers were recorded for this mock interview, so it was saved as incomplete
                without a scorecard or a fake zero score. Re-run the session and answer at least one
                question to generate scoring and debrief feedback.
              </p>
              {isSavingSummary && (
                <p className="text-xs text-muted-foreground">Saving incomplete session…</p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                variant="primary"
                size="sm"
                fullWidth
                disabled={isSavingSummary}
                onClick={() => navigate("/app/mock")}
              >
                Start a new mock
              </Button>
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

    return (
      <PostSessionSummary
        sessionId={summaryStats.sessionId}
        onStartNew={() => navigate("/app/mock")}
      />
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
                  onClick={() => navigate(`/app/debriefs/${summaryStats.sessionId}`)}
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
    <div className="min-h-screen bg-background text-foreground">
      <LiveSessionController isActive={true} />
      <OverlayKeyboardHandler
        enabled={phase === "active"}
        onToggleMute={audio.toggleMute}
        onGenerate={() => void handleRequestHint()}
      />

      {/* Compact mock chrome — speaking/transcript live only in the overlay */}
      <header className="fixed top-0 inset-x-0 z-[200] border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Badge variant="primary" size="sm">
              mock
            </Badge>
            <span className="text-xs text-muted-foreground font-medium truncate">
              Q <span className="text-foreground font-bold tabular-nums">{qIndex + 1}</span>
              <span className="text-muted-foreground"> / {totalQ}</span>
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
                timeColor === "emerald"
                  ? "text-emerald-500"
                  : timeColor === "amber"
                    ? "text-amber-500"
                    : "text-red-500",
              )}
            >
              <Timer className="w-3.5 h-3.5" />
              {timerDisplay}
            </span>
            {isPaused && <Badge variant="amber" size="sm">Paused</Badge>}
            {isListeningActive && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Listening in overlay
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
              onClick={() => setSkipConfirm(true)}
              leftIcon={<SkipForward className="w-3 h-3" />}
            >
              Skip
            </Button>
            <Button
              variant="primary"
              size="xs"
              disabled={generationInFlight || phase !== "active"}
              data-testid="mock-next-question"
              onClick={() => void handleNextQuestion()}
              rightIcon={
                generationInFlight ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : isLastQ ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )
              }
            >
              {generationInFlight
                ? "Generating…"
                : isLastQ
                  ? "Finish"
                  : "Next"}
            </Button>
            <Button
              variant="danger"
              size="xs"
              disabled={phase !== "active"}
              data-testid="mock-end-session"
              onClick={() => setEndConfirm(true)}
              leftIcon={<Square className="w-3 h-3" />}
            >
              End
            </Button>
          </div>
        </div>
        <div className="h-0.5 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
          />
        </div>
      </header>

      <div className="flex min-h-screen items-center justify-center px-4 pt-20 pb-28">
        <div className="w-full max-w-md text-center space-y-4">
          <p className="text-lg font-semibold text-foreground">Mock overlay active</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isMobile
              ? "Speech, transcript, and AI hints appear in the overlay. Desktop keyboard shortcuts are not available on this device — use on-screen controls."
              : (
                <>
                  Speech, transcript, fillers, and AI hints appear in the floating overlay — not on this
                  page. Use{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono">
                    Ctrl+Shift+H
                  </kbd>{" "}
                  to show or hide it.
                </>
              )}
          </p>

          <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {generationInFlight ? "Current question (generating next…)" : "Current question"}
            </p>
            <p className="text-sm text-foreground leading-relaxed" data-testid="mock-current-question">
              {questionText || "Waiting for question…"}
            </p>
            {generationInFlight && (
              <p
                className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5"
                data-testid="mock-generating-next"
              >
                <RefreshCw className="w-3 h-3 animate-spin" />
                Generating next question…
              </p>
            )}
            {nextQuestionError && (
              <div className="mt-3 space-y-2" data-testid="mock-generation-error">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  We couldn&apos;t generate the next question.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="xs"
                    data-testid="mock-retry-next"
                    onClick={() => void retryNextQuestion()}
                  >
                    Retry
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => setEndConfirm(true)}
                  >
                    End Interview
                  </Button>
                </div>
              </div>
            )}
            {usedLocalQuestions && !nextQuestionError && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Practice question from the approved question bank
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setCalmMode(true)}
              leftIcon={<EyeOff className="w-3 h-3" />}
            >
              Calm steps
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={audio.toggleMute}
              leftIcon={
                isMuted ? <MicOff className="w-3 h-3 text-red-400" /> : <Mic className="w-3 h-3" />
              }
            >
              {isMuted ? "Unmute" : "Mute mic"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => useOverlayStore.getState().showOverlay()}
              leftIcon={<Eye className="w-3 h-3" />}
            >
              Show overlay
            </Button>
          </div>

          <details className="rounded-xl border border-border bg-card/40 text-left">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              Session notes (optional)
            </summary>
            <div className="px-3 pb-3">
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Jot down key points…"
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </details>
        </div>
      </div>

      {/* Overlay — one instance per session; ErrorBoundary prevents blank app crash */}
      {phase === "active" &&
        overlayInitState === "ready" &&
        Boolean(sessionIdFromStore) && (
          <ErrorBoundary
            fallback={(_error, retry) => (
              <div
                className="fixed bottom-4 right-4 z-[500] max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg space-y-3"
                data-testid="mock-overlay-error"
              >
                <p className="text-sm font-medium text-foreground">
                  The interview interface encountered a problem.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="xs" onClick={retry}>
                    Retry
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => void handleEndSession()}
                  >
                    End Session
                  </Button>
                </div>
              </div>
            )}
          >
            <OverlayWindow
              key={`mock-overlay-${sessionIdFromStore}`}
              onToggleMic={audio.toggleMute}
              onToggleSystemAudio={audio.toggleSystemAudio}
              onReconnectAudio={() => void audio.reconnect()}
              onGenerate={() => void handleRequestHint()}
              onRegenerate={() => void handleRequestHint()}
              onShorten={() => void handleRequestHint()}
              onExpand={() => void handleRequestHint()}
              onEndSession={handleEndSession}
              onManualQuestion={(q: string) => {
                if (!isMockSessionMutable(lifecycleRef.current)) return;
                useOverlayStore.getState().setCurrentQuestion(q);
                void orchestrator.requestHint(q);
              }}
              isPreparingSession={false}
            />
          </ErrorBoundary>
        )}

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
            disabled={generationInFlight}
            onClick={() => {
              captureAnswer(true);
              setSkipConfirm(false);
              void handleNextQuestion({ skipCapture: true });
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
