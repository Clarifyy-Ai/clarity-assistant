// ─────────────────────────────────────────────────────────────────────────────
// live/MockSession.tsx — AI-driven mock interview session inside the live
// interface. Bridges LiveOverlay and MockInterview logic: loads a question
// queue from the session store, streams AI interviewer messages, records
// user audio responses, and hands off to the Debrief page on completion.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams }             from "react-router-dom";
import { motion, AnimatePresence }                  from "framer-motion";

import { useSessionStore }  from "@/store/sessionStore";
import { useAudioStore }    from "@/store/audioStore";
import { useAuthStore }     from "@/store";
import { ROUTES }           from "@/lib/constants";
import { formatDurationSec } from "@/lib/utils/formatters";
import { cn }               from "@/lib/utils";

import { Button }           from "@/components/ui/button";
import { Badge }            from "@/components/ui/badge";
import { Progress }         from "@/components/ui/progress";
import { ScrollArea }       from "@/components/ui/scroll-area";
import { Separator }        from "@/components/ui/separator";
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
  Mic, MicOff, SkipForward, Square,
  Clock, Brain, ChevronRight,
  Volume2, Loader2, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockQuestion {
  id:       string;
  text:     string;
  type:     "behavioral" | "technical" | "situational" | "hr";
  timeLimit: number;   // seconds
  hint?:    string;
}

type SessionPhase =
  | "intro"       // countdown before first question
  | "questioning" // AI reads question, user prepares
  | "answering"   // user speaks their answer
  | "transition"  // brief pause between questions
  | "complete";   // all questions done → redirect to debrief

// ─── Mock question bank (replaced by sessionStore questions in production) ────

const FALLBACK_QUESTIONS: MockQuestion[] = [
  { id: "q1", text: "Tell me about yourself and why you're interested in this role.",                              type: "hr",          timeLimit: 120, hint: "Structure: Present → Past → Future" },
  { id: "q2", text: "Describe a time you handled a conflict within your team. What was the outcome?",              type: "behavioral",  timeLimit: 150, hint: "Use the STAR method" },
  { id: "q3", text: "How do you prioritise tasks when you have multiple urgent deadlines simultaneously?",         type: "situational", timeLimit: 120 },
  { id: "q4", text: "What is the difference between a process and a thread? When would you use each?",            type: "technical",   timeLimit: 90  },
  { id: "q5", text: "Where do you see yourself in 3–5 years, and how does this role fit into that vision?",       type: "hr",          timeLimit: 90  },
];

const TYPE_COLORS: Record<MockQuestion["type"], string> = {
  behavioral:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  technical:   "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  situational: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  hr:          "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useCountdown(initialSeconds: number, active: boolean, onExpire: () => void) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, onExpire]);

  return { remaining, reset: () => setRemaining(initialSeconds) };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MockSession() {
  const navigate       = useNavigate();
  const [params]       = useSearchParams();
  const sessionId      = params.get("sessionId") ?? "mock";

  const { user }       = useAuthStore((s) => ({ user: s.user }));
  const { isMicActive, startMic, stopMic, rmsLevel } =
    useAudioStore((s) => ({
      isMicActive: s.isRecording,
      startMic:    s.startRecording,
      stopMic:     s.stopRecording,
      rmsLevel:    s.rmsLevel ?? 0,
    }));

  const [questions,    setQuestions]    = useState<MockQuestion[]>(FALLBACK_QUESTIONS);
  const [questionIdx,  setQuestionIdx]  = useState(0);
  const [phase,        setPhase]        = useState<SessionPhase>("intro");
  const [introCount,   setIntroCount]   = useState(3);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [elapsedSec,   setElapsedSec]   = useState(0);
  const [answers,      setAnswers]      = useState<Record<string, string>>({});

  const currentQ  = questions[questionIdx];
  const progress  = ((questionIdx) / questions.length) * 100;

  // ── Session elapsed timer ──────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Intro countdown (3 → 2 → 1 → Go) ─────────────────────────────────────

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

  // ── Answer time expired ────────────────────────────────────────────────────

  const handleTimeExpired = useCallback(() => {
    if (phase !== "answering") return;
    stopMic();
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: prev[currentQ.id] ?? "[Time expired — no answer recorded]",
    }));
    goToNextQuestion();
  }, [phase, currentQ, stopMic]);

  const { remaining, reset: resetTimer } = useCountdown(
    currentQ?.timeLimit ?? 120,
    phase === "answering",
    handleTimeExpired
  );

  // ── Question flow ─────────────────────────────────────────────────────────

  const startAnswering = useCallback(() => {
    resetTimer();
    setPhase("answering");
    startMic();
  }, [resetTimer, startMic]);

  const stopAnswering = useCallback(() => {
    stopMic();
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: prev[currentQ.id] ?? "[Answer recorded]",
    }));
    goToNextQuestion();
  }, [stopMic, currentQ]);

  const goToNextQuestion = useCallback(() => {
    if (questionIdx + 1 >= questions.length) {
      setPhase("complete");
      setTimeout(() => {
        navigate(`${ROUTES.DEBRIEF}/${sessionId}`);
      }, 2000);
      return;
    }

    setPhase("transition");
    setTimeout(() => {
      setQuestionIdx((i) => i + 1);
      setPhase("questioning");
    }, 1200);
  }, [questionIdx, questions.length, navigate, sessionId]);

  const handleSkip = useCallback(() => {
    stopMic();
    goToNextQuestion();
  }, [stopMic, goToNextQuestion]);

  const handleEndSession = useCallback(() => {
    stopMic();
    navigate(`${ROUTES.DEBRIEF}/${sessionId}`);
  }, [stopMic, navigate, sessionId]);

  // ── Timer colour ──────────────────────────────────────────────────────────

  const timerRatio = remaining / (currentQ?.timeLimit ?? 120);
  const timerColor =
    timerRatio > 0.5 ? "text-foreground"
    : timerRatio > 0.25 ? "text-amber-500"
    : "text-red-500";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
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

          {/* Session progress */}
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

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">

          <AnimatePresence mode="wait">

            {/* ── Intro countdown ──────────────────────────────────────── */}
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
                  animate={{ scale: 1,   opacity: 1 }}
                  exit={{ scale: 1.4,    opacity: 0 }}
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

            {/* ── Question card ─────────────────────────────────────────── */}
            {(phase === "questioning" || phase === "answering") && currentQ && (
              <motion.div
                key={`q-${questionIdx}-${phase}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Question header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Question {questionIdx + 1}
                    </span>
                  </div>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                    TYPE_COLORS[currentQ.type]
                  )}>
                    {currentQ.type}
                  </span>
                </div>

                {/* Question text */}
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

                {/* Timer (answering only) */}
                {phase === "answering" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className={cn("h-4 w-4", timerColor)} />
                        <span className={cn("text-2xl font-bold tabular-nums", timerColor)}>
                          {formatDurationSec(remaining)}
                        </span>
                      </div>

                      {/* Mic level visualiser */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-1 rounded-full bg-primary"
                            animate={{
                              height: isMicActive && rmsLevel > (i / 8)
                                ? `${12 + Math.random() * 16}px`
                                : "4px",
                            }}
                            transition={{ duration: 0.1 }}
                          />
                        ))}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {isMicActive ? "Recording" : "—"}
                        </span>
                      </div>
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

                {/* Actions */}
                <div className="flex items-center gap-3">
                  {phase === "questioning" && (
                    <Button
                      size="lg"
                      className="flex-1"
                      onClick={startAnswering}
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Start answering
                    </Button>
                  )}

                  {phase === "answering" && (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="flex-1"
                      onClick={stopAnswering}
                    >
                      <MicOff className="h-4 w-4 mr-2" />
                      Done answering
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleSkip}
                    className="text-muted-foreground"
                  >
                    <SkipForward className="h-4 w-4 mr-1.5" />
                    Skip
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── Transition between questions ──────────────────────────── */}
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

            {/* ── Session complete ─────────────────────────────────────────── */}
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
                <p className="text-muted-foreground">
                  Generating your debrief report…
                </p>
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* ── End session dialog ────────────────────────────────────────────────── */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              You've answered {Object.keys(answers).length} of {questions.length} questions.
              Your progress will be saved and you'll be taken to the debrief.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndSession}
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
