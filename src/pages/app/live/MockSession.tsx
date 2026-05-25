// src/pages/app/live/MockSession.tsx — PRODUCTION READY
// AI-driven mock interview session inside the live interface.
// Fixes:
// - Removed @ts-nocheck and aligned with current audioStore schema
// - Uses useAudioSession pipeline (mic capture + Deepgram transcription)
// - Correct per-question answer capture via utterance index snapshot
// - Keeps fallback questions + best-effort generate-questions load

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { useAudioStore } from "@/store/audioStore";
import { ROUTES } from "@/lib/constants";
import { formatDurationSec } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAudioSession } from "@/hooks/useAudioSession";

import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Mic,
  MicOff,
  SkipForward,
  Square,
  Clock,
  Brain,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockQuestion {
  id: string;
  text: string;
  type: "behavioral" | "technical" | "situational" | "hr";
  timeLimit: number; // seconds
  hint?: string;
}

type SessionPhase =
  | "intro"
  | "questioning"
  | "answering"
  | "transition"
  | "complete";

// ─── Fallback question bank ───────────────────────────────────────────────────

const FALLBACK_QUESTIONS: MockQuestion[] = [
  {
    id: "q1",
    text: "Tell me about yourself and why you're interested in this role.",
    type: "hr",
    timeLimit: 120,
    hint: "Structure: Present → Past → Future",
  },
  {
    id: "q2",
    text: "Describe a time you handled a conflict within your team. What was the outcome?",
    type: "behavioral",
    timeLimit: 150,
    hint: "Use the STAR method",
  },
  {
    id: "q3",
    text: "How do you prioritise tasks when you have multiple urgent deadlines simultaneously?",
    type: "situational",
    timeLimit: 120,
  },
  {
    id: "q4",
    text: "What is the difference between a process and a thread? When would you use each?",
    type: "technical",
    timeLimit: 90,
  },
  {
    id: "q5",
    text: "Where do you see yourself in 3–5 years, and how does this role fit into that vision?",
    type: "hr",
    timeLimit: 90,
  },
];

const TYPE_COLORS: Record<MockQuestion["type"], string> = {
  behavioral: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  technical: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  situational: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  hr: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

// ─── useCountdown — stable timer hook ────────────────────────────────────────

function useCountdown(initialSeconds: number, active: boolean, onExpire: () => void) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          onExpireRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [active]);

  const reset = useCallback(() => setRemaining(initialSeconds), [initialSeconds]);
  return { remaining, reset };
}

// ─── MicVisualiser ───────────────────────────────────────────────────────────

function MicVisualiser({ isActive, rmsLevel }: { isActive: boolean; rmsLevel: number }) {
  const BAR_COUNT = 8;

  // rmsLevel is expected 0..1-ish; clamp for safety
  const level = Math.max(0, Math.min(1, rmsLevel));

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const threshold = i / BAR_COUNT;
        const lit = isActive && level > threshold;
        return (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-primary"
            animate={{ height: lit ? `${10 + (level - threshold) * 24}px` : "4px" }}
            transition={{ duration: 0.08, ease: "easeOut" }}
          />
        );
      })}
      <span className="ml-1.5 text-xs text-muted-foreground">
        {isActive ? "Recording" : "—"}
      </span>
    </div>
  );
}

function normalizeType(value: unknown): MockQuestion["type"] {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("tech")) return "technical";
  if (v.includes("situ")) return "situational";
  if (v.includes("hr")) return "hr";
  if (v.includes("behav") || v.includes("behavior") || v.includes("behaviour")) return "behavioral";
  return "behavioral";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MockSession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId") ?? "mock";

  // Audio store (current schema)
  const utterances = useAudioStore((s) => s.transcript?.utterances ?? []);
  const rmsLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted ?? false);

  // Use master audio pipeline (Deepgram + transcript to store)
  const audio = useAudioSession({
    enableSystemAudio: false,
    micDeviceId: null,
    onQuestionDetected: () => {
      // Not needed in this mock flow (questions come from queue)
    },
    onFillerDetected: () => {
      // Optional: could be used for metrics
    },
    onWPMUpdate: () => {
      // Optional: could be used for metrics
    },
  });

  const isMicActive = isCapturing && !isMuted;

  const [questions, setQuestions] = useState<MockQuestion[]>(FALLBACK_QUESTIONS);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("intro");
  const [introCount, setIntroCount] = useState(3);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Store per-question answer text
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Track utterance start index for each question so we can capture only that answer
  const answerStartIndexRef = useRef<number>(0);

  const currentQ = questions[questionIdx];
  const progress = ((questionIdx + 1) / questions.length) * 100;

  // Best-effort AI question loading (fallback remains)
  useEffect(() => {
    let cancelled = false;

    async function loadAiQuestions() {
      try {
        const result: any = await fetchEdgeJson("generate-questions", {
          interview_type: "behavioral",
          company: "",
          role: "",
          question_count: 5,
        });

        const list = result?.questions ?? result?.data?.questions;
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          const mapped: MockQuestion[] = list
            .map((q: any) => ({
              id: q.id ?? (crypto?.randomUUID?.() ?? `q-${Date.now()}-${Math.random()}`),
              text: q.question_text ?? q.question ?? "",
              type: normalizeType(q.type),
              timeLimit: 120,
            }))
            .filter((q: MockQuestion) => q.text && q.text.length > 5);

          if (mapped.length > 0) {
            setQuestions(mapped);
            return;
          }
        }
        toast.info("Using built-in practice questions — AI question generation was unavailable.");
      } catch (err) {
        console.error("[LiveMockSession] AI question load failed:", err);
        toast.info("Using built-in practice questions — connect to generate personalized questions.");
      }
    }

    loadAiQuestions();
    return () => {
      cancelled = true;
    };
  }, []);

  // Elapsed timer (after intro)
  useEffect(() => {
    if (phase === "intro" || phase === "complete") return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Intro countdown
  useEffect(() => {
    if (phase !== "intro") return;
    const id = setInterval(() => {
      setIntroCount((n) => {
        if (n <= 1) {
          clearInterval(id);
          setPhase("questioning");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const goToNextQuestion = useCallback(
    (total: number) => {
      setQuestionIdx((current) => {
        if (current + 1 >= total) {
          setPhase("complete");
          setTimeout(() => {
            const route = (ROUTES as any).DEBRIEF
              ? `${(ROUTES as any).DEBRIEF}/${sessionId}`
              : `/app/debrief/${sessionId}`;
            navigate(route);
          }, 2000);
          return current;
        }

        setPhase("transition");
        setTimeout(() => {
          setPhase("questioning");
        }, 1200);

        return current + 1;
      });
    },
    [navigate, sessionId],
  );

  // Extract only candidate utterances since start index
  const computeAnswerText = useCallback(() => {
    const slice = utterances.slice(answerStartIndexRef.current);
    const text = slice
      .filter((u) => u?.speaker === "candidate")
      .map((u) => u.text)
      .join(" ")
      .trim();
    return text;
  }, [utterances]);

  const handleTimeExpired = useCallback(() => {
    // Only applies if currently answering
    setPhase((cur) => {
      if (cur !== "answering") return cur;

      // "Stop answering" behavior: mute + record answer + transition
      try {
        if (!audio.isMuted) audio.toggleMute();
      } catch {
        // ignore
      }

      const q = questions[questionIdx];
      const answerText = computeAnswerText();

      if (q) {
        setAnswers((prev) => ({
          ...prev,
          [q.id]: answerText || "[Time expired — no answer recorded]",
        }));
      }

      // Move forward
      goToNextQuestion(questions.length);
      return "transition";
    });
  }, [audio, questions, questionIdx, computeAnswerText, goToNextQuestion]);

  const { remaining, reset: resetTimer } = useCountdown(
    currentQ?.timeLimit ?? 120,
    phase === "answering",
    handleTimeExpired,
  );

  const startAnswering = useCallback(async () => {
    resetTimer();
    setPhase("answering");

    // Snapshot where this answer starts in transcript stream
    answerStartIndexRef.current = useAudioStore.getState().transcript?.utterances?.length ?? 0;

    // Start pipeline once; if already started just ensure unmuted
    if (!audio.isCapturing) {
      await audio.start();
    }

    // Ensure unmuted while answering
    try {
      if (audio.isMuted) audio.toggleMute();
    } catch {
      // ignore
    }
  }, [resetTimer, audio]);

  const stopAnswering = useCallback(() => {
    // Stop answering = mute mic (keeps pipeline alive for stability)
    try {
      if (!audio.isMuted) audio.toggleMute();
    } catch {
      // ignore
    }

    const q = questions[questionIdx];
    const answerText = computeAnswerText();

    if (q) {
      setAnswers((prev) => ({
        ...prev,
        [q.id]: answerText || "[No speech detected]",
      }));
    }

    goToNextQuestion(questions.length);
  }, [audio, questions, questionIdx, computeAnswerText, goToNextQuestion]);

  const handleSkip = useCallback(() => {
    // Mute if answering
    try {
      if (!audio.isMuted) audio.toggleMute();
    } catch {
      // ignore
    }
    goToNextQuestion(questions.length);
  }, [audio, goToNextQuestion, questions.length]);

  const handleEndSession = useCallback(async () => {
    // Stop pipeline fully
    try {
      audio.stop();
    } catch {
      // ignore
    }
    setShowEndDialog(false);
    const route = (ROUTES as any).DEBRIEF ? `${(ROUTES as any).DEBRIEF}/${sessionId}` : `/app/debrief/${sessionId}`;
    navigate(route);
  }, [audio, navigate, sessionId]);

  const timerRatio = (currentQ?.timeLimit ?? 120) > 0 ? remaining / (currentQ?.timeLimit ?? 120) : 0;
  const timerColor =
    timerRatio > 0.5 ? "text-foreground" : timerRatio > 0.25 ? "text-amber-500" : "text-red-500";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="tabular-nums">{formatDurationSec(elapsedSec)}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground tabular-nums">
              {questionIdx + 1} / {questions.length}
            </span>
          </div>

          <div className="flex-1 mx-6 max-w-xs">
            <Progress value={progress} className="h-1.5" />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => setShowEndDialog(true)}
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            End session
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">
          <AnimatePresence mode="wait">
            {phase === "intro" && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="text-center space-y-4"
              >
                <p className="text-muted-foreground text-sm uppercase tracking-widest">
                  Mock interview starting in
                </p>
                <motion.div
                  key={introCount}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.4, opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="text-8xl font-bold tabular-nums text-primary"
                >
                  {introCount}
                </motion.div>
                <p className="text-muted-foreground text-sm">
                  {questions.length} questions · Mic will activate when ready
                </p>
              </motion.div>
            )}

            {(phase === "questioning" || phase === "answering") && currentQ && (
              <motion.div
                key={`q-${questionIdx}-${phase}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Question {questionIdx + 1}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                      TYPE_COLORS[currentQ.type]
                    )}
                  >
                    {currentQ.type}
                  </span>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                  <p className="text-xl font-medium leading-relaxed">{currentQ.text}</p>

                  {currentQ.hint && phase === "questioning" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-4 pt-4 border-t border-border/50 flex items-start gap-2"
                    >
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm text-muted-foreground">{currentQ.hint}</p>
                    </motion.div>
                  )}
                </div>

                {phase === "answering" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className={cn("h-4 w-4", timerColor)} />
                        <span className={cn("text-2xl font-bold tabular-nums", timerColor)}>
                          {formatDurationSec(remaining)}
                        </span>
                      </div>
                      <MicVisualiser isActive={isMicActive} rmsLevel={rmsLevel} />
                    </div>

                    <Progress
                      value={timerRatio * 100}
                      className={cn(
                        "h-1.5",
                        timerRatio < 0.25 && "[&>div]:bg-red-500",
                        timerRatio < 0.5 && timerRatio >= 0.25 && "[&>div]:bg-amber-500"
                      )}
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {phase === "questioning" && (
                    <Button size="lg" className="flex-1" onClick={() => void startAnswering()}>
                      <Mic className="h-4 w-4 mr-2" />
                      Start answering
                    </Button>
                  )}
                  {phase === "answering" && (
                    <Button size="lg" variant="destructive" className="flex-1" onClick={stopAnswering}>
                      <MicOff className="h-4 w-4 mr-2" />
                      Done answering
                    </Button>
                  )}
                  <Button variant="outline" size="lg" onClick={handleSkip} className="text-muted-foreground">
                    <SkipForward className="h-4 w-4 mr-1.5" />
                    Skip
                  </Button>
                </div>
              </motion.div>
            )}

            {phase === "transition" && (
              <motion.div
                key="transition"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-3 py-12"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground text-sm">Next question loading…</p>
              </motion.div>
            )}

            {phase === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4 py-12"
              >
                <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Brain className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold">Session complete!</h2>
                <p className="text-muted-foreground">Generating your debrief report…</p>
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ve answered {Object.keys(answers).length} of {questions.length} questions.
              Your progress will be saved and you&apos;ll be taken to the debrief.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleEndSession()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
