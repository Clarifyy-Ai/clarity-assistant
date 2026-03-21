// @ts-nocheck
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
import { useAuthStore } from "@/store/userStore";
import { useAudioStore } from "@/store/audioStore";
import { OverlayWindow } from "@/components/overlay/OverlayWindow";
import { LiveSessionController } from "@/components/live/LiveSessionController";
import { PreSessionSetup } from "@/components/session/PreSessionSetup";
import { sessionsDB } from "@/lib/supabase/database";
import { supabase } from "@/integrations/supabase/client";
import { toDbModel } from "@/lib/ai/modelMapping";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  Mic, MicOff, Square, ChevronRight,
  SkipForward, Eye, EyeOff, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";

export default function MockSession() {
  const navigate      = useNavigate();
  const { profile }   = useAuthStore();
  const orchestrator  = useSessionOrchestrator();
  const stt           = useSpeechRecognition();
  const fillerHook    = useFillerWordDetection(stt.interimTranscript);
  const wpmHook       = useWPMTracker(stt.transcript);
  const sentimentHook = useSentimentAnalysis(stt.transcript);
  const startTimeRef  = useRef<string>(new Date().toISOString());

  const [phase,        setPhase]       = useState<"setup" | "active">("setup");
  const [panicMode,    setPanicMode]   = useState(false);
  const [skipConfirm,  setSkipConfirm] = useState(false);
  const [endConfirm,   setEndConfirm]  = useState(false);
  const sessionConfigRef = useRef<LiveSessionConfig | null>(null);

  const SESSION_DURATION = 5 * 60;
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_DURATION);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === "active") {
      useOverlayStore.getState().showOverlay();
    }
    return () => {
      useOverlayStore.getState().hideOverlay();
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "active") return;
    sessionTimerRef.current = setInterval(() => {
      setSessionTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(sessionTimerRef.current!);
          handleEndSession();
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
  }, [orchestrator.currentQuestionIndex]);

  useHotkeys([
    { keys: "ctrl+shift+h", handler: () => {
      const overlay = useOverlayStore.getState();
      overlay.is_visible ? overlay.hideOverlay() : overlay.showOverlay();
    }},
    { keys: "ctrl+shift+p", handler: () => setPanicMode((p) => !p) },
    { keys: "ctrl+shift+s", handler: () => stt.toggleMute() },
    { keys: "ctrl+shift+n", handler: () => setSkipConfirm(true) },
  ]);

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
      if (useOverlayStore.getState().auto_generate) {
        handleRequestHint();
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
      speaker: "user",
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

  async function handleSetup(config: LiveSessionConfig) {
    sessionConfigRef.current = config;
    startTimeRef.current = new Date().toISOString();

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
          model_used: toDbModel(config.model),
        });
      } catch (err) {
        console.error("[MockSession] Failed to create session record:", err);
      }
    }

    setPhase("active");
    stt.start();
  }

  async function handleNextQuestion() {
    stt.stop();

    if (isLastQ) {
      clearInterval(sessionTimerRef.current!);
      useOverlayStore.getState().hideOverlay();
      await persistMockSession();
      await orchestrator.completeSession();
    } else {
      orchestrator.nextQuestion();
      stt.start();
    }
  }

  async function handleRequestHint() {
    const q = typeof question === "string" ? question : question?.question_text;
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
      const dbModel = toDbModel(overlay.active_model);
      const transcript = stt.transcript || "";
      const questionCount = orchestrator.totalQuestions ?? 0;

      await sessionsDB.update(sessionId, {
        status:            "completed",
        credits_used:      session.credits_consumed,
        model_used:        dbModel,
        ended_at:          new Date().toISOString(),
        filler_words:      fillerHook.totalCount,
        avg_wpm:           wpmHook.wpm,
        hints_used:        overlay.hint_history.length,
        answers_generated: overlay.hint_history.length,
        questions_asked:   questionCount,
        notes:             transcript || null,
      });

      if (transcript) {
        await supabase.from("session_transcripts").insert({
          session_id: sessionId,
          content:    transcript,
          speaker:    "candidate",
          is_final:   true,
        });
      }

      if (overlay.hint_history.length > 0) {
        const interactions = overlay.hint_history.map((h) => ({
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
    }
  }

  async function handleEndSession() {
    clearInterval(sessionTimerRef.current!);
    stt.stop();
    useOverlayStore.getState().hideOverlay();
    await persistMockSession();
    await orchestrator.completeSession();
  }

  if (phase === "setup") {
    return (
      <PreSessionSetup
        onStart={handleSetup}
        sessionType="mock"
      />
    );
  }

  if (panicMode) {
    return (
      <div
        className="min-h-screen bg-[#0a0a0f] flex items-center justify-center cursor-pointer"
        onClick={() => setPanicMode(false)}
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-accent/5 rounded-2xl flex items-center justify-center mx-auto">
            <Eye className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Click anywhere to restore</p>
          <kbd className="text-[10px] text-gray-700 bg-accent/5 px-2 py-1 rounded">
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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <LiveSessionController isActive={true} />

      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-lg space-y-6 p-6">

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

          <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "flex items-center gap-1.5 text-sm font-bold tabular-nums",
                timeColor === "emerald" ? "text-emerald-400" :
                timeColor === "amber"   ? "text-amber-400"   : "text-red-400"
              )}>
                <Timer className="w-3.5 h-3.5" />
                {Math.floor(sessionTimeLeft / 60)}:{String(sessionTimeLeft % 60).padStart(2, "0")}
              </div>
              <button
                onClick={() => setSkipConfirm(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                Skip
              </button>
            </div>

            <p className="text-foreground text-base font-medium leading-relaxed">
              {questionText}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  stt.isListening ? "bg-red-500 animate-pulse" : "bg-gray-700"
                )} />
                <span className="text-xs font-medium text-foreground">Your answer</span>
                <span className={cn(
                  "text-xs font-medium",
                  wpmHook.wpm > 160 ? "text-amber-400" :
                  wpmHook.wpm < 80  ? "text-blue-400"  : "text-emerald-400"
                )}>
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
                      "{word}" x{count as number}
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
            Use <kbd className="px-1 py-0.5 bg-white/10 rounded font-mono">Ctrl+Shift+H</kbd> to toggle it.
          </p>
        </div>
      </div>

      <OverlayWindow
        onToggleMic={stt.toggleMute}
        onGenerate={handleRequestHint}
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
            setSkipConfirm(false);
            if (isLastQ) {
              orchestrator.completeSession();
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
