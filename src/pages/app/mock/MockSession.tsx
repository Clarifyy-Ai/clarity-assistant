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
import { MockSessionController } from "@/components/mock/MockSessionController";
import { PostSessionSummary } from "@/components/session/PostSessionSummary";
import { setGenerateAnswerHandler } from "@/lib/overlay/hotkeys";
import { saveLastSessionSummary } from "@/lib/session/lastSessionSummary";
import {
  beginOverlayProductSession,
  bindOverlayProductSessionId,
  markOverlayProductSessionActive,
  markOverlayProductSessionReady,
  markOverlayProductSessionTerminal,
  syncOverlayAuthReady,
  teardownOverlayProductSession,
} from "@/lib/session/overlayProductSession";
import {
  getOverlaySessionAuthority,
  useOverlaySessionAuthorityStore,
} from "@/store/overlaySessionAuthorityStore";
import {
  sessionsDB,
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
  encodeMockProgressNotes,
  isSkippedAnswerText,
  parseMockProgressNotes,
  SKIPPED_ANSWER_SENTINEL,
  type MockProgressAnswer,
} from "@/lib/mock/mockSessionProgress";
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
import {
  answerNextStatusLabel,
  isAnswerNextBusy,
  reduceAnswerNext,
  type AnswerFinalizationOutcome,
  type AnswerNextState,
  type MockAnswerStatus,
} from "@/lib/mock/answerNextFsm";
import { finalizeMockAnswer } from "@/lib/mock/mockAnswerCapture";
import { toDbModel } from "@/lib/ai/modelMapping";
import { finalizeSession as finalizeSessionApi } from "@/lib/api/sessions";
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
  question_id: string | null;
  question_text: string;
  answer_text: string;
  question_index: number;
  skipped: boolean;
  status: MockAnswerStatus;
  outcome: AnswerFinalizationOutcome;
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
const ANSWER_PERSISTENCE_USER_ERROR =
  "Your answer could not be saved. Please retry before moving on.";

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

  const [answerNextState, setAnswerNextState] = useState<AnswerNextState>("ready");
  const answerNextOpRef = useRef(0);
  /** Synchronous lock so rapid Next clicks cannot start two next-ops. */
  const nextOpLockRef = useRef(false);
  const listeningStartedAtRef = useRef<number | null>(null);
  const interviewerAudioActiveRef = useRef(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const typedAnswerRef = useRef("");
  typedAnswerRef.current = typedAnswer;
  const [currentAnswerStatus, setCurrentAnswerStatus] =
    useState<MockAnswerStatus>("unanswered");

  const audio = useAudioSession({
    enableSystemAudio: false,
    micOptional: true,
    micDeviceId,
    noiseSuppression,
    onQuestionDetected: () => {
      // Silence may finalize a *detected* response — never auto-advance,
      // and never treat pure silence as an answer.
      if (interviewerAudioActiveRef.current) return;
      if (!isMockSessionMutable(lifecycleRef.current)) return;
      const session = useSessionStore.getState();
      const idx = session.current_question_index ?? 0;
      const qText = session.questions[idx]?.question_text ?? "";
      const store = useAudioStore.getState();
      const draft = finalizeMockAnswer({
        utterances: store.transcript?.utterances ?? [],
        interimText: store.transcript?.interim_text ?? "",
        listeningStartedAtMs: listeningStartedAtRef.current,
        questionText: qText,
        typedAnswer: typedAnswerRef.current,
        interviewerAudioActive: false,
      });
      if (draft.answer_text || draft.status === "answered") {
        setCurrentAnswerStatus("draft");
        setAnswerNextState((s) => reduceAnswerNext(s, { type: "ANSWER_DETECTED" }));
      }
    },
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
  const overlayGenerationRef = useRef<number>(0);

  const canMountOverlay = useOverlaySessionAuthorityStore((s) => s.canMountOverlay());

  useEffect(() => {
    syncOverlayAuthReady(Boolean(profile?.id));
  }, [profile?.id]);

  const SESSION_DURATION = maxSessionSecondsForPlan(planId);
  const [timerMode, setTimerMode] = useState<"countdown" | "countup">("countdown");
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_DURATION);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Elapsed seconds restored from progress — survives stale React state in handleSetup. */
  const restoredElapsedRef = useRef(0);
  const sessionElapsedRef = useRef(0);

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

  // Overlay mount only after authoritative mock session context is ready — one instance per session.
  useEffect(() => {
    const sessionId = useSessionStore.getState().session_id;
    const auth = getOverlaySessionAuthority();
    if (
      phase === "active" &&
      sessionId &&
      canMountOverlay &&
      auth.mode === "mock" &&
      isMockSessionMutable(lifecycleRef.current)
    ) {
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
  }, [phase, canMountOverlay]);

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
    listeningStartedAtRef.current = null;
    setTypedAnswer("");
    typedAnswerRef.current = "";
    setCurrentAnswerStatus("unanswered");
    useAudioStore.getState().updateInterimText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestrator.currentQuestionIndex]);

  // Keep elapsed + question list durable across refresh while answering.
  useEffect(() => {
    if (phase !== "active") return;
    const id = window.setInterval(() => {
      if (!isMockSessionMutable(lifecycleRef.current)) return;
      void writeMockProgress();
    }, 15_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void writeMockProgress();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Next-question only — overlay H/P/M are OverlayKeyboardHandler (avoid double-toggle).
  useHotkeys({
    "ctrl+shift+n": () => {
      if (phase !== "active") return;
      if (!isMockSessionMutable(lifecycleRef.current)) return;
      if (isQuestionGenerationInFlight(generationSnap.state)) return;
      if (nextOpLockRef.current || isAnswerNextBusy(answerNextState)) return;
      setSkipConfirm(true);
    },
  });

  const question = orchestrator.currentQuestion;
  const qIndex = orchestrator.currentQuestionIndex ?? 0;
  const totalQ = targetQuestionCount;
  const isLastQ = qIndex >= totalQ - 1;
  const generationInFlight = isQuestionGenerationInFlight(generationSnap.state);

  const beginCandidateListening = useCallback(
    (qId: string) => {
      if (!isMockSessionMutable(lifecycleRef.current)) return;
      if (speakingQuestionIdRef.current !== qId) return;
      // Idempotent: do not reset the listening window if already open for this Q.
      if (!interviewerAudioActiveRef.current && listeningStartedAtRef.current != null) {
        return;
      }
      interviewerAudioActiveRef.current = false;
      audio.resumeCandidateCapture();
      listeningStartedAtRef.current = Date.now();
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "SPEAKING_DONE" }));
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "START_LISTENING" }));
    },
    [audio],
  );

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

    if (!qText) return;

    // Clean prior question audio / finalization timers before new question.
    stopBrowserTts();
    interviewerAudioActiveRef.current = false;
    listeningStartedAtRef.current = null;

    injectInterviewerQuestion(qText, qIndex);
    const overlay = useOverlayStore.getState();
    overlay.setSessionPipelineState("question_generated");
    overlay.setCurrentQuestion(qText);
    setAnswerNextState((s) => reduceAnswerNext(s, { type: "QUESTION_READY" }));

    if (overlay.auto_generate) {
      void handleRequestHint(qText);
    }

    speakingQuestionIdRef.current = qId;
    setAnswerNextState((s) => reduceAnswerNext(s, { type: "START_SPEAKING" }));
    interviewerAudioActiveRef.current = true;
    audio.suspendCandidateCapture();

    speakQuestionText(qText, {
      questionId: qId,
      isCurrent: (id) =>
        speakingQuestionIdRef.current === id &&
        isMockSessionMutable(lifecycleRef.current) &&
        getOverlaySessionAuthority().canAcceptSessionMutations(),
      onStart: () => {
        interviewerAudioActiveRef.current = true;
        audio.suspendCandidateCapture();
        if (getOverlaySessionAuthority().canAcceptSessionMutations()) {
          useOverlayStore.getState().setSessionPipelineState("question_spoken");
        }
      },
      onEnd: () => {
        if (getOverlaySessionAuthority().canAcceptSessionMutations()) {
          useOverlayStore.getState().setSessionPipelineState("candidate_answering");
        }
        beginCandidateListening(qId);
      },
    });

    // If TTS is unavailable, open listening after a short beat.
    const fallbackTimer = window.setTimeout(() => {
      if (
        speakingQuestionIdRef.current === qId &&
        interviewerAudioActiveRef.current &&
        isMockSessionMutable(lifecycleRef.current)
      ) {
        beginCandidateListening(qId);
      }
    }, 12_000);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question, qIndex, injectInterviewerQuestion, beginCandidateListening]);

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

  function captureAnswer(skipped = false): QuestionAnswer {
    const qText = typeof question === "string" ? question : question?.question_text ?? "";
    const qId =
      typeof question === "string"
        ? `q-${qIndex}`
        : question?.id ?? `q-${qIndex}`;
    const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
    const existingIdx = answersRef.current.findIndex((a) => a.question_index === qIndex);
    const audioState = useAudioStore.getState();
    const captured = finalizeMockAnswer({
      skipped,
      utterances: audioState.transcript?.utterances ?? [],
      interimText: audioState.transcript?.interim_text ?? "",
      listeningStartedAtMs: listeningStartedAtRef.current,
      questionText: qText,
      interviewerAudioActive: interviewerAudioActiveRef.current,
      typedAnswer: typedAnswerRef.current,
    });
    const entry: QuestionAnswer = {
      question_id: qId,
      question_text: qText,
      answer_text: captured.answer_text,
      question_index: qIndex,
      skipped: captured.skipped,
      status: captured.status,
      outcome: captured.outcome,
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
    setCurrentAnswerStatus(captured.status);
    return entry;
  }

  async function persistCurrentAnswers(): Promise<void> {
    const userId = profile?.id;
    const sessionId = useSessionStore.getState().session_id;
    if (!userId || !sessionId) {
      throw new Error("Mock session identity is unavailable.");
    }

    // Persist every visited question — including skipped — so refresh can restore.
    const visited = answersRef.current;
    if (visited.length === 0) return;

    await sessionAnswersDB.createMany(
      visited.map((a) => ({
        session_id: sessionId,
        user_id: userId,
        question: a.question_text,
        answer: a.skipped
          ? SKIPPED_ANSWER_SENTINEL
          : (a.answer_text ?? "").trim().length > 0
            ? a.answer_text
            : "",
        duration_ms: a.duration_seconds * 1000,
        question_index: a.question_index,
      })),
    );
  }

  async function writeMockProgress(): Promise<void> {
    const sessionId = useSessionStore.getState().session_id;
    if (!sessionId) return;
    const questions = useSessionStore.getState().questions;
    if (!questions.length) return;

    const progressNotes = encodeMockProgressNotes({
      current_question_index: useSessionStore.getState().current_question_index ?? 0,
      elapsed_seconds: sessionElapsedRef.current,
      target_question_count: targetQuestionCount,
      started_at: startTimeRef.current,
      questions,
      answers: answersRef.current.map(
        (a): MockProgressAnswer => ({
          question_id: a.question_id,
          question_text: a.question_text,
          answer_text: a.answer_text,
          question_index: a.question_index,
          skipped: a.skipped,
          status: a.status,
          outcome: a.outcome,
          filler_count: a.filler_count,
          wpm: a.wpm,
          duration_seconds: a.duration_seconds,
          timestamp: a.timestamp,
        }),
      ),
    });

    try {
      await sessionsDB.update(sessionId, {
        notes: progressNotes,
        questions_asked: targetQuestionCount,
      } as Parameters<typeof sessionsDB.update>[1]);
    } catch (err) {
      console.warn("[MockSession] progress checkpoint failed:", err);
    }
  }

  function rebuildMockTranscriptFromProgress(
    questions: SessionQuestion[],
    answers: QuestionAnswer[],
  ) {
    const store = useAudioStore.getState();
    store.clearTranscript();
    const byIndex = new Map(answers.map((a) => [a.question_index, a]));
    const now = Date.now();
    questions.forEach((q, index) => {
      const qText = q.question_text?.trim();
      if (!qText) return;
      store.addUtterance({
        id: `mock-q-${index}`,
        text: qText,
        speaker: "interviewer",
        words: [],
        start_ms: now + index * 2000,
        end_ms: now + index * 2000 + 500,
        is_final: true,
        is_interviewer_question: true,
        confidence: 1,
      });
      const ans = byIndex.get(index);
      if (ans && !ans.skipped && (ans.answer_text ?? "").trim()) {
        store.addUtterance({
          id: `mock-a-${index}`,
          text: ans.answer_text.trim(),
          speaker: "candidate",
          words: [],
          start_ms: now + index * 2000 + 600,
          end_ms: now + index * 2000 + 1500,
          is_final: true,
          is_interviewer_question: false,
          confidence: 1,
        });
      }
    });
    const current = questions[useSessionStore.getState().current_question_index];
    if (current?.question_text) {
      store.setLastQuestion(current.question_text);
    }
  }

  /**
   * Hydrate from session_answers + sessions.notes progress when refreshing an
   * in-progress mock. Returns true when Q1 generation should be skipped.
   */
  async function tryRestoreMockProgress(
    dbSessionId: string,
    mockConfig: MockConfig,
  ): Promise<boolean> {
    let progress = null as ReturnType<typeof parseMockProgressNotes>;
    try {
      const row = await sessionsDB.getByIdForUser(dbSessionId, profile!.id);
      progress = parseMockProgressNotes(row?.notes);
      if (typeof row?.questions_asked === "number" && row.questions_asked > 0) {
        setTargetQuestionCount(row.questions_asked);
      }
    } catch (err) {
      console.warn("[MockSession] failed to load session for restore:", err);
    }

    let answerRows: Awaited<ReturnType<typeof sessionAnswersDB.listBySessionId>> = [];
    try {
      answerRows = await sessionAnswersDB.listBySessionId(dbSessionId);
    } catch (err) {
      console.warn("[MockSession] failed to load session_answers for restore:", err);
    }

    if (!progress?.questions?.length && answerRows.length === 0) {
      return false;
    }

    const restoredAnswers: QuestionAnswer[] = progress?.answers?.length
      ? progress.answers.map((a) => ({
          question_id: a.question_id,
          question_text: a.question_text,
          answer_text: a.skipped ? "" : a.answer_text,
          question_index: a.question_index,
          skipped: a.skipped,
          status: a.status,
          outcome: a.outcome,
          filler_count: a.filler_count,
          wpm: a.wpm,
          duration_seconds: a.duration_seconds,
          timestamp: a.timestamp,
        }))
      : answerRows.map((row) => {
          const skipped = isSkippedAnswerText(row.answer);
          const qIndex =
            typeof row.question_index === "number" ? row.question_index : 0;
          return {
            question_id: `q-${qIndex}`,
            question_text: row.question,
            answer_text: skipped ? "" : (row.answer ?? ""),
            question_index: qIndex,
            skipped,
            status: (skipped ? "skipped" : "answered") as MockAnswerStatus,
            outcome: (skipped ? "SKIPPED" : "VALID_ANSWER") as AnswerFinalizationOutcome,
            filler_count: 0,
            wpm: 0,
            duration_seconds: Math.round((row.duration_ms ?? 0) / 1000),
            timestamp: row.created_at,
          };
        });

    answersRef.current = restoredAnswers;

    const restoredQuestions: SessionQuestion[] = progress?.questions?.length
      ? progress.questions
      : answerRows.map((row, i) => {
          const qIndex =
            typeof row.question_index === "number" ? row.question_index : i;
          return {
            id: `restored-${dbSessionId}-q${qIndex}`,
            session_id: dbSessionId,
            question_number: qIndex + 1,
            question_text: row.question,
            question_type: (mockConfig.interview_type as SessionQuestion["question_type"]) ?? "behavioural",
            expected_duration_seconds: 120,
            difficulty: "medium",
            tags: [],
            company_specific: false,
          };
        });

    if (!restoredQuestions.length) return false;

    const { questionCount } = resolveMockConfigFields(mockConfig);
    const target =
      progress?.target_question_count ??
      (typeof questionCount === "number" ? questionCount : restoredQuestions.length);
    setTargetQuestionCount(target);

    orchestrator.setQuestions(restoredQuestions);
    questionsCacheRef.current = useSessionStore.getState().questions;

    const maxAnsweredIndex = restoredAnswers.reduce(
      (max, a) => Math.max(max, a.question_index),
      -1,
    );
    let restoreIndex =
      typeof progress?.current_question_index === "number"
        ? progress.current_question_index
        : Math.max(maxAnsweredIndex, 0);
    restoreIndex = Math.min(
      Math.max(0, restoreIndex),
      Math.max(restoredQuestions.length - 1, 0),
    );
    useSessionStore.getState().setCurrentQuestionIndex(restoreIndex);

    const elapsed = progress?.elapsed_seconds ?? 0;
    restoredElapsedRef.current = elapsed;
    sessionElapsedRef.current = elapsed;
    if (progress?.started_at) {
      startTimeRef.current = progress.started_at;
    } else if (elapsed > 0) {
      startTimeRef.current = new Date(Date.now() - elapsed * 1000).toISOString();
    }
    setSessionElapsed(elapsed);
    setSessionTimeLeft(Math.max(0, SESSION_DURATION - elapsed));

    rebuildMockTranscriptFromProgress(restoredQuestions, restoredAnswers);
    toast.message("Resuming your in-progress mock interview");
    return true;
  }

  function cleanupQuestionAudio(options?: { preserveListeningWindow?: boolean }) {
    speakingQuestionIdRef.current = null;
    interviewerAudioActiveRef.current = false;
    if (!options?.preserveListeningWindow) {
      listeningStartedAtRef.current = null;
    }
    stopBrowserTts();
    audio.resumeCandidateCapture();
    useAudioStore.getState().updateInterimText("");
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
      await writeMockProgress();
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
    restoredElapsedRef.current = 0;
    sessionElapsedRef.current = 0;
    answersRef.current = [];

    sessionConfigRef.current = config;
    setMicDeviceId(config.mic_device_id ?? null);
    setNoiseSuppression(config.noise_suppression ?? true);
    startTimeRef.current = new Date().toISOString();
    endCalledRef.current = false;

    const { generation } = beginOverlayProductSession({ mode: "mock" });
    overlayGenerationRef.current = generation;

    const overlay = useOverlayStore.getState();
    // Apply user's stealth preference from setup config (after authoritative begin).
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
      markOverlayProductSessionTerminal(generation, "FAILED");
      teardownOverlayProductSession(generation);
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
        bindOverlayProductSessionId(dbSessionId, generation);
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

      if (!getOverlaySessionAuthority().matchesGeneration(generation)) {
        isStartingRef.current = false;
        return;
      }

      setSetupStep("questions");
      const restored = await tryRestoreMockProgress(dbSessionId!, mockConfig);
      if (!restored) {
        await loadQuestions(dbSessionId!, mockConfig);
      }
    } catch (err) {
      console.error("[MockSession] setup failed:", err);
      if (handleSessionStartError(err)) {
        markOverlayProductSessionTerminal(generation, "FAILED");
        teardownOverlayProductSession(generation);
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
      markOverlayProductSessionTerminal(generation, "FAILED");
      teardownOverlayProductSession(generation);
      isStartingRef.current = false;
      return;
    }

    try {
      if (!getOverlaySessionAuthority().matchesGeneration(generation)) {
        isStartingRef.current = false;
        return;
      }
      markOverlayProductSessionReady(generation);
      setSetupStep("audio");
      await audio.start();
      const restoredElapsed = restoredElapsedRef.current;
      sessionElapsedRef.current = restoredElapsed;
      setSessionElapsed(restoredElapsed);
      setSessionTimeLeft(Math.max(0, SESSION_DURATION - restoredElapsed));
      setIsPaused(false);
      if (!getOverlaySessionAuthority().matchesGeneration(generation)) {
        audio.stop();
        isStartingRef.current = false;
        return;
      }
      markOverlayProductSessionActive(generation);
      setPhase("active");
      setOverlayInitState("ready");
      useOverlayStore.getState().showOverlay();
      // audio.start() clears transcript — re-apply restored utterances after start.
      if (answersRef.current.length || questionsCacheRef.current?.length) {
        rebuildMockTranscriptFromProgress(
          useSessionStore.getState().questions,
          answersRef.current,
        );
      }
    } catch (err) {
      console.error("[MockSession] audio start failed:", err);
      // micOptional allows text-only mock — still enter active session.
      toast.warning("Mic unavailable — continuing with overlay chat and hints.");
      useAudioStore.getState().setStreamError(null);
      const restoredElapsed = restoredElapsedRef.current;
      sessionElapsedRef.current = restoredElapsed;
      setSessionElapsed(restoredElapsed);
      setSessionTimeLeft(Math.max(0, SESSION_DURATION - restoredElapsed));
      setIsPaused(false);
      if (getOverlaySessionAuthority().matchesGeneration(generation)) {
        markOverlayProductSessionReady(generation);
        markOverlayProductSessionActive(generation);
        setPhase("active");
        setOverlayInitState("ready");
        useOverlayStore.getState().showOverlay();
        if (answersRef.current.length || questionsCacheRef.current?.length) {
          rebuildMockTranscriptFromProgress(
            useSessionStore.getState().questions,
            answersRef.current,
          );
        }
      }
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

  async function finalizeSession(skipCapture = false, skipped = false) {
    if (endCalledRef.current) return;
    endCalledRef.current = true;

    const gen = overlayGenerationRef.current;

    // ACTIVE → ENDING → ENDED (terminal)
    lifecycleRef.current = reduceMockSessionLifecycle(lifecycleRef.current, {
      type: "BEGIN_END",
    });
    setOverlayInitState("ended");
    answerNextOpRef.current += 1; // invalidate in-flight next-question ops
    nextOpLockRef.current = false;
    abortInFlightGeneration();
    orchestrator.cancelHintRequest();
    // Snapshot before freeze + media stop — capture last answer first.
    if (!skipCapture) {
      try {
        captureAnswer(skipped);
      } catch {
        /* ignore */
      }
    }

    cleanupQuestionAudio();

    const startedMs = startTimeRef.current
      ? new Date(startTimeRef.current).getTime()
      : Date.now();
    const timeTakenSeconds = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
    const questionsAnswered = answersRef.current.filter(
      (a) =>
        !a.skipped &&
        a.status === "answered" &&
        (a.answer_text ?? "").trim().length > 0,
    ).length;
    const creditsUsed = useSessionStore.getState().credits_consumed;
    const sessionId = useSessionStore.getState().session_id;
    const hintsUsed = useOverlayStore.getState().hint_history.length;
    const incompleteNoAnswers = questionsAnswered === 0;

    useOverlayStore.getState().setSessionPipelineState("session_ending");
    markOverlayProductSessionTerminal(gen, "USER_ENDED");

    clearSessionTimers();

    audio.stop();
    useOverlayStore.getState().hideOverlay();
    overlayMountedSessionRef.current = null;
    lifecycleRef.current = reduceMockSessionLifecycle(lifecycleRef.current, {
      type: "CONFIRM_ENDED",
    });

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
      const sid = sessionId;
      if (userId && !incompleteNoAnswers) {
        const totalSessions = await sessionsDB.countCompletedByUserId(userId);
        await checkPostSessionAchievements({
          sessionType: "mock",
          sessionId: sid ?? undefined,
          totalSessions,
          durationMinutes: Math.round(timeTakenSeconds / 60),
        });
      }
    } finally {
      useOverlayStore.getState().setSessionPipelineState("session_saved");
      teardownOverlayProductSession(gen);
      setIsSavingSummary(false);
    }
  }

  async function handleNextQuestion(options?: { skipCapture?: boolean; skipped?: boolean }) {
    if (!isMockSessionMutable(lifecycleRef.current)) return;
    if (nextOpLockRef.current) return;
    if (generationInFlight || isAnswerNextBusy(answerNextState)) return;
    // Do not silently ignore intentional chrome clicks during overlay ghost suppress.
    // Ghost guard excludes [data-mock-chrome]; keep a soft warn only.
    if (isOverlayGhostClickSuppressed()) {
      console.debug("[MockSession] next while ghost-suppress active — proceeding (chrome)");
    }

    nextOpLockRef.current = true;
    const opId = ++answerNextOpRef.current;

    try {
      // Stop interviewer TTS first; keep listening window until answer is captured.
      speakingQuestionIdRef.current = null;
      interviewerAudioActiveRef.current = false;
      stopBrowserTts();
      audio.suspendCandidateCapture();

      setAnswerNextState((s) =>
        reduceAnswerNext(s, { type: options?.skipped ? "SKIP" : "FINALIZE" }),
      );

      if (isLastQ) {
        await finalizeSession(options?.skipCapture, options?.skipped);
        if (opId === answerNextOpRef.current) {
          setAnswerNextState((s) => reduceAnswerNext(s, { type: "COMPLETE" }));
        }
        return;
      }

      if (!options?.skipCapture) {
        captureAnswer(Boolean(options?.skipped));
      }
      try {
        await persistCurrentAnswers();
        await writeMockProgress();
      } catch (err) {
        console.error("[MockSession] answer persistence failed:", err);
        throw new Error(ANSWER_PERSISTENCE_USER_ERROR);
      }
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "ANSWER_SAVED" }));
      // Product rule: empty Next → unanswered (not auto-answered). Skip is explicit.

      cleanupQuestionAudio();
      setTypedAnswer("");
      typedAnswerRef.current = "";

      setNextQuestionError(null);
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "REQUEST_NEXT" }));
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "START_GENERATING" }));

      const sessionId = useSessionStore.getState().session_id;
      const cfg = sessionConfigRef.current as MockConfig | null;
      if (!sessionId || !cfg) {
        setNextQuestionError(QUESTION_GENERATION_USER_ERROR);
        setAnswerNextState((s) => reduceAnswerNext(s, { type: "FAIL" }));
        return;
      }

      const usedQuestions = useSessionStore.getState().questions;
      const usedTexts = usedQuestions.map((q) => q.question_text).filter(Boolean);
      const usedIds = new Set(usedQuestions.map((q) => q.id).filter(Boolean));
      const nextNumber = qIndex + 2;

      const nextQ = await runQuestionGeneration({
        dbSessionId: sessionId,
        config: cfg,
        questionNumber: nextNumber,
        usedTexts,
      });

      if (opId !== answerNextOpRef.current) return;
      if (!isMockSessionMutable(lifecycleRef.current)) return;
      if (useSessionStore.getState().session_id !== sessionId) return;

      // Prefer ID tracking for repeat protection when provider reuses text unexpectedly.
      if (nextQ.id && usedIds.has(nextQ.id)) {
        throw new Error("Duplicate question id returned for next question.");
      }

      orchestrator.appendAndActivateQuestion(nextQ);
      questionsCacheRef.current = useSessionStore.getState().questions;
      questionStartRef.current = Date.now();
      setTypedAnswer("");
      typedAnswerRef.current = "";
      setCurrentAnswerStatus("unanswered");
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "QUESTION_READY" }));
      setAnswerNextState((s) => reduceAnswerNext(s, { type: "NEXT_READY" }));
      void writeMockProgress();
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        !isMockSessionMutable(lifecycleRef.current)
      ) {
        // Unlock Next/Retry when abort left us mid-pipeline (e.g. cancelled gen).
        if (isMockSessionMutable(lifecycleRef.current) && opId === answerNextOpRef.current) {
          setAnswerNextState((s) => reduceAnswerNext(s, { type: "FAIL" }));
        }
        return;
      }
      console.warn("[MockSession] next question generation failed:", err);
      const userError =
        err instanceof Error && err.message === ANSWER_PERSISTENCE_USER_ERROR
          ? ANSWER_PERSISTENCE_USER_ERROR
          : QUESTION_GENERATION_USER_ERROR;
      setNextQuestionError(userError);
      toast.error(userError);
      if (opId === answerNextOpRef.current) {
        setAnswerNextState((s) => reduceAnswerNext(s, { type: "FAIL" }));
      }
    } finally {
      if (opId === answerNextOpRef.current) {
        nextOpLockRef.current = false;
      }
    }
  }

  async function retryNextQuestion() {
    if (!isMockSessionMutable(lifecycleRef.current)) return;
    if (generationInFlight || nextOpLockRef.current) return;
    setNextQuestionError(null);
    // Recover from failed / stuck pending so Next can run again.
    setAnswerNextState((s) => reduceAnswerNext(s, { type: "READY" }));
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
      const answeredCount = answersRef.current.filter(
        (a) =>
          !a.skipped &&
          a.status === "answered" &&
          (a.answer_text ?? "").trim().length > 0,
      ).length;
      const incompleteNoAnswers = opts?.incompleteNoAnswers ?? answeredCount === 0;

      const existingNotes = sessionNotes.trim();
      const persistTranscripts = parsePrivacyPrefs(profile?.privacy_prefs).store_transcripts;
      const notesParts = [
        incompleteNoAnswers ? INCOMPLETE_NO_ANSWERS_NOTE : null,
        existingNotes || null,
        persistTranscripts && !incompleteNoAnswers ? transcript || null : null,
      ].filter(Boolean);

      const scoredAnswers = answersRef.current.filter(
        (a) =>
          !a.skipped &&
          a.status === "answered" &&
          (a.answer_text ?? "").trim().length > 0,
      );
      let endedByRpc = false;
      await finalizeSessionApi({
        session_id: sessionId,
        terminal_reason: incompleteNoAnswers ? "CANCELLED" : "USER_ENDED",
        answers: scoredAnswers.map((a) => ({
          question_index: a.question_index,
          question: a.question_text,
          answer: a.answer_text,
          duration_ms: a.duration_seconds * 1000,
        })),
        transcript:
          transcript && !incompleteNoAnswers && persistTranscripts
            ? { content: transcript, utterances }
            : null,
        metrics: {
          credits_used: session.credits_consumed,
          model_used: dbModel,
          filler_words: fillerHook.totalCount,
          avg_wpm: wpmHook.wpm,
          hints_used: overlay.hint_history.length,
          answers_generated: answeredCount,
          questions_asked: targetQuestionCount,
          notes: notesParts.length > 0 ? notesParts.join("\n") : null,
          ...(endedByRpc
          ? {}
          : {}),
        },
      });
      endedByRpc = true;

      await useAuthStore.getState().refreshCredits();
    } catch (err) {
      console.error("[MockSession] Failed to persist session:", err);
      toast.error("Session could not be fully saved. Please retry.");
      throw err;
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
  const answerStatusLabel = answerNextStatusLabel(answerNextState);
  const nextDisabled =
    phase !== "active" ||
    generationInFlight ||
    isAnswerNextBusy(answerNextState);

  const isListeningActive =
    !isPaused &&
    !interviewerAudioActiveRef.current &&
    (answerNextState === "listening" || answerNextState === "answer_detected") &&
    isCapturing &&
    (deepgramStatus === "connected" || deepgramStatus === "reconnecting");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MockSessionController
        isActive={phase === "active"}
        isPaused={isPaused}
        timerMode={timerMode}
        sessionDurationSeconds={SESSION_DURATION}
        onTickCountdown={setSessionTimeLeft}
        onTickCountup={(seconds) => {
          sessionElapsedRef.current = seconds;
          setSessionElapsed(seconds);
        }}
        onAutoEnd={() => {
          void handleEndSessionRef.current?.();
        }}
      />
      <OverlayKeyboardHandler
        enabled={phase === "active"}
        onToggleMute={audio.toggleMute}
        onGenerate={() => void handleRequestHint()}
      />

      {/* Compact mock chrome — speaking/transcript live only in the overlay */}
      <header
        data-mock-chrome
        className="fixed top-0 inset-x-0 z-[1200] border-b border-border bg-background/95 backdrop-blur"
      >
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
            {currentAnswerStatus === "skipped" && (
              <Badge variant="amber" size="sm">Skipped</Badge>
            )}
            {answerStatusLabel && (
              <span
                className="hidden sm:inline text-[10px] font-medium text-muted-foreground truncate max-w-[14rem]"
                data-testid="mock-answer-status"
              >
                {answerStatusLabel}
              </span>
            )}
            {isListeningActive && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Listening
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
              variant="secondary"
              size="xs"
              disabled={nextDisabled}
              data-testid="mock-skip-question"
              onClick={() => setSkipConfirm(true)}
              leftIcon={<SkipForward className="w-3 h-3" />}
            >
              Skip / I don&apos;t know
            </Button>
            <Button
              variant="primary"
              size="xs"
              disabled={nextDisabled}
              data-testid="mock-next-question"
              data-allow-during-ghost-suppress
              onClick={() => void handleNextQuestion()}
              rightIcon={
                generationInFlight ||
                answerNextState === "next_question_pending" ||
                answerNextState === "question_generating" ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : isLastQ ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )
              }
            >
              {generationInFlight ||
              answerNextState === "next_question_pending" ||
              answerNextState === "question_generating"
                ? "Generating…"
                : answerNextState === "answer_finalizing" ||
                    answerNextState === "answer_finalized" ||
                    answerNextState === "answer_saved"
                  ? "Saving…"
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

          <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-left space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your answer (voice or type)
            </p>
            <textarea
              value={typedAnswer}
              onChange={(e) => {
                const v = e.target.value;
                setTypedAnswer(v);
                typedAnswerRef.current = v;
                if (v.trim()) {
                  setCurrentAnswerStatus("draft");
                  setAnswerNextState((s) =>
                    reduceAnswerNext(s, { type: "ANSWER_DETECTED" }),
                  );
                }
              }}
              placeholder="Type your answer here, or speak into the mic…"
              rows={3}
              disabled={phase !== "active" || nextDisabled}
              data-testid="mock-typed-answer"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Status:{" "}
              <span className="text-foreground font-medium" data-testid="mock-answer-status-value">
                {currentAnswerStatus}
              </span>
              {" · "}
              Silence alone does not count as an answer — use Skip or Next.
            </p>
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
        canMountOverlay &&
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
                const sessionId = sessionIdFromStore;
                if (
                  !sessionId ||
                  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    sessionId,
                  )
                ) {
                  return;
                }
                void import("@/lib/ai/coachChatSession").then(({ submitCoachChatMessage }) =>
                  submitCoachChatMessage({
                    message: q,
                    sessionId,
                    currentQuestion:
                      useOverlayStore.getState().current_question?.trim() || q,
                    recentTranscript: "",
                    resumeContext:
                      typeof useOverlayStore.getState().resume_context === "object"
                        ? useOverlayStore.getState().resume_context?.summary ?? ""
                        : String(useOverlayStore.getState().resume_context ?? ""),
                  }),
                );
              }}
              isPreparingSession={false}
            />
          </ErrorBoundary>
        )}

      <Modal open={skipConfirm} onClose={() => setSkipConfirm(false)} title="Skip question?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">
          This question will be marked as skipped. No AI answer will be created.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setSkipConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            disabled={nextDisabled}
            data-testid="mock-skip-confirm"
            onClick={() => {
              setSkipConfirm(false);
              void handleNextQuestion({ skipped: true });
            }}
          >
            Skip / I don&apos;t know
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
