// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionOrchestrator } from "@/hooks/useSessionOrchestrator";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useFillerWordDetection } from "@/hooks/useFillerWordDetection";
import { useWPMTracker } from "@/hooks/useWPMTracker";
import { useSentimentAnalysis } from "@/hooks/useSentimentAnalysis";
import { useCredits } from "@/hooks/useCredits";
import { useHotkeys } from "@/hooks/useHotkeys";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Modal } from "@/components/ui/Modal";
import {
  Mic, MicOff, Square, ChevronRight,
  SkipForward, AlertTriangle, MessageSquare,
  Zap, Timer, BarChart2, RefreshCw,
  ThumbsUp, ThumbsDown, Eye, EyeOff,
  Volume2, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// MockSession — active interview session
// Real-time: filler counter, WPM, sentiment, STT transcript,
// AI hint panel, question timer, coach chat, panic hide
// ─────────────────────────────────────────────────────────────────

export default function MockSession() {
  const navigate      = useNavigate();
  const orchestrator  = useSessionOrchestrator();
  const stt           = useSpeechRecognition();
  const fillerHook    = useFillerWordDetection(stt.interimTranscript);
  const wpmHook       = useWPMTracker(stt.transcript);
  const sentimentHook = useSentimentAnalysis(stt.transcript);
  const credits       = useCredits();

  // ── Local state ───────────────────────────────────────────────
  const [panicMode,     setPanicMode]     = useState(false);
  const [hintVisible,   setHintVisible]   = useState(true);
  const [coachOpen,     setCoachOpen]     = useState(false);
  const [skipConfirm,   setSkipConfirm]   = useState(false);
  const [endConfirm,    setEndConfirm]    = useState(false);
  const [feedbackQ,     setFeedbackQ]     = useState<null | "up" | "down">(null);

  // ── Question timer ────────────────────────────────────────────
  const [timeLeft,      setTimeLeft]      = useState(orchestrator.currentTimeLimit ?? 180);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleNextQuestion();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [orchestrator.currentQuestionIndex]);

  // ── Reset timer on new question ───────────────────────────────
  useEffect(() => {
    setTimeLeft(orchestrator.currentTimeLimit ?? 180);
    stt.resetTranscript();
    fillerHook.reset();
    wpmHook.reset();
    setFeedbackQ(null);
  }, [orchestrator.currentQuestionIndex]);

  // ── Hotkeys ───────────────────────────────────────────────────
  useHotkeys([
    { keys: "ctrl+shift+h", handler: () => setHintVisible((p) => !p) },
    { keys: "ctrl+shift+p", handler: () => setPanicMode((p) => !p)   },
    { keys: "ctrl+shift+s", handler: () => stt.toggleMute()          },
    { keys: "ctrl+shift+n", handler: () => setSkipConfirm(true)      },
  ]);

  // ── Derived ───────────────────────────────────────────────────
  const question      = orchestrator.currentQuestion;
  const hint          = orchestrator.currentHint;
  const qIndex        = orchestrator.currentQuestionIndex ?? 0;
  const totalQ        = orchestrator.totalQuestions ?? 5;
  const isLastQ       = qIndex >= totalQ - 1;
  const timeColor     =
    timeLeft > 60  ? "emerald" :
    timeLeft > 20  ? "amber"   : "red";
  const timePct = ((orchestrator.currentTimeLimit ?? 180) - timeLeft)
    / (orchestrator.currentTimeLimit ?? 180) * 100;

  // ── Actions ───────────────────────────────────────────────────

  async function handleNextQuestion() {
    clearInterval(timerRef.current!);
    stt.stop();
    await orchestrator.submitAnswer({
      transcript:   stt.transcript,
      wpm:          wpmHook.wpm,
      fillerCount:  fillerHook.totalCount,
      sentiment:    sentimentHook.label,
    });

    if (isLastQ) {
      await orchestrator.finaliseSession();
      navigate(`/app/scorecard/${orchestrator.sessionId}`);
    } else {
      await orchestrator.loadNextQuestion();
      stt.start();
    }
  }

  async function handleRequestHint() {
    if (!credits.canAfford("live_hint")) return;
    await orchestrator.requestHint();
    setHintVisible(true);
  }

  async function handleEndSession() {
    clearInterval(timerRef.current!);
    stt.stop();
    await orchestrator.finaliseSession();
    navigate(`/app/scorecard/${orchestrator.sessionId}`);
  }

  // ── Panic mode — hide everything ─────────────────────────────
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

  return (
    <div className="max-w-4xl space-y-4">

      {/* ── Top bar ───────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Question progress */}
          <span className="text-xs text-muted-foreground font-medium">
            Question <span className="text-foreground font-bold">{qIndex + 1}</span> / {totalQ}
          </span>
          <Badge variant={
            orchestrator.interviewType === "behavioural" ? "blue" :
            orchestrator.interviewType === "technical"   ? "emerald" :
            "violet"
          } size="sm">
            {orchestrator.interviewType ?? "mock"}
          </Badge>
          {orchestrator.targetCompany && (
            <Badge variant="default" size="sm">{orchestrator.targetCompany}</Badge>
          )}
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
            End session
          </Button>
        </div>
      </div>

      {/* ── Question progress bar ──────────────────────── */}
      <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-500"
          style={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left: question + transcript ───────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Question card */}
          <Card className="relative overflow-hidden">
            {/* Timer bar */}
            <div className="absolute top-0 left-0 right-0 h-1">
              <div
                className={cn(
                  "h-full transition-all",
                  timeColor === "emerald" ? "bg-emerald-500" :
                  timeColor === "amber"   ? "bg-amber-500"   : "bg-red-500 animate-pulse"
                )}
                style={{ width: `${100 - timePct}%` }}
              />
            </div>

            <div className="pt-2">
              {/* Timer */}
              <div className="flex items-center justify-between mb-3">
                <div className={cn(
                  "flex items-center gap-1.5 text-sm font-bold tabular-nums",
                  timeColor === "emerald" ? "text-emerald-400" :
                  timeColor === "amber"   ? "text-amber-400"   : "text-red-400"
                )}>
                  <Timer className="w-3.5 h-3.5" />
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </div>
                <button
                  onClick={() => setSkipConfirm(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                  <SkipForward className="w-3 h-3" />
                  Skip
                </button>
              </div>

              {/* Question text */}
              <p className="text-foreground text-base font-medium leading-relaxed">
                {question}
              </p>

              {/* Question category tags */}
              {orchestrator.currentQuestionMeta?.tags?.map((tag: string) => (
                <Badge key={tag} variant="gray" size="sm" className="mt-2 mr-1">
                  {tag}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Live transcript */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  stt.isListening ? "bg-red-500 animate-pulse" : "bg-gray-700"
                )} />
                <span className="text-xs font-medium text-foreground">Your answer</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-xs font-medium",
                  wpmHook.wpm > 160 ? "text-amber-400" :
                  wpmHook.wpm < 80  ? "text-blue-400"  : "text-emerald-400"
                )}>
                  {wpmHook.wpm} WPM
                </span>
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
            </div>

            {/* Transcript text */}
            <div className="min-h-[80px] text-sm text-foreground leading-relaxed">
              {stt.transcript || (
                <span className="text-muted-foreground italic">Start speaking…</span>
              )}
              {stt.interimTranscript && (
                <span className="text-muted-foreground italic"> {stt.interimTranscript}</span>
              )}
            </div>

            {/* Filler words inline highlight */}
            {fillerHook.totalCount > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Fillers detected:</span>
                {Object.entries(fillerHook.counts)
                  .filter(([, count]) => (count as number) > 0)
                  .map(([word, count]) => (
                    <Badge key={word} variant="amber" size="sm">
                      "{word}" ×{count as number}
                    </Badge>
                  ))}
              </div>
            )}
          </Card>

          {/* Next / submit button */}
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
            {isLastQ ? "Finish & see scorecard" : "Next question →"}
          </Button>
        </div>

        {/* ── Right: metrics + hint ─────────────────────── */}
        <div className="space-y-3">

          {/* Live metrics */}
          <Card padding="sm">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              Live metrics
            </p>
            <div className="space-y-3">
              <MetricRow
                label="Filler words"
                value={fillerHook.totalCount}
                max={20}
                color={fillerHook.totalCount <= 3 ? "emerald" : fillerHook.totalCount <= 8 ? "amber" : "red"}
                unit=""
              />
              <MetricRow
                label="Speaking pace"
                value={wpmHook.wpm}
                max={200}
                color={wpmHook.wpm >= 80 && wpmHook.wpm <= 160 ? "emerald" : "amber"}
                unit=" WPM"
              />
              <MetricRow
                label="Confidence"
                value={sentimentHook.confidence}
                max={100}
                color={sentimentHook.confidence >= 65 ? "emerald" : "amber"}
                unit="%"
              />
            </div>

            {/* Sentiment label */}
            <div className="mt-3 flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground capitalize">
                Tone: {sentimentHook.label ?? "neutral"}
              </span>
              <Badge
                variant={
                  sentimentHook.label === "positive"  ? "emerald" :
                  sentimentHook.label === "negative"  ? "red"     : "default"
                }
                size="sm"
              >
                {sentimentHook.score ?? 0}
              </Badge>
            </div>
          </Card>

          {/* AI Hint panel */}
          <Card padding="sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-foreground">AI Hint</span>
              </div>
              <div className="flex items-center gap-1.5">
                {credits.isLow && (
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                )}
                <button
                  onClick={() => setHintVisible((p) => !p)}
                  className="text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                  {hintVisible
                    ? <EyeOff className="w-3.5 h-3.5" />
                    : <Eye className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            </div>

            {hintVisible ? (
              hint ? (
                <>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                    {hint}
                  </p>

                  {/* Hint feedback */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/8">
                    <span className="text-[10px] text-muted-foreground">Helpful?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setFeedbackQ("up"); orchestrator.submitHintFeedback("up"); }}
                        className={cn(
                          "p-1 rounded-lg transition-colors",
                          feedbackQ === "up" ? "text-emerald-400" : "text-muted-foreground hover:text-muted-foreground"
                        )}
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => { setFeedbackQ("down"); orchestrator.submitHintFeedback("down"); }}
                        className={cn(
                          "p-1 rounded-lg transition-colors",
                          feedbackQ === "down" ? "text-red-400" : "text-muted-foreground hover:text-muted-foreground"
                        )}
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => orchestrator.requestHint(true)}
                        title="Regenerate hint"
                        className="p-1 rounded-lg text-muted-foreground hover:text-muted-foreground transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground italic">
                    No hint loaded yet.
                  </p>
                  <Button
                    variant="secondary"
                    size="xs"
                    fullWidth
                    disabled={!credits.canAfford("live_hint")}
                    onClick={handleRequestHint}
                    leftIcon={<Zap className="w-3 h-3" />}
                  >
                    {credits.canAfford("live_hint")
                      ? "Get AI hint"
                      : "No credits"
                    }
                  </Button>
                </div>
              )
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Hint hidden — click 👁 to show
              </p>
            )}
          </Card>

          {/* Coach chat button */}
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => setCoachOpen(true)}
            leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
          >
            Ask AI coach
          </Button>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────── */}

      {/* Skip confirm */}
      <Modal
        open={skipConfirm}
        onClose={() => setSkipConfirm(false)}
        title="Skip question?"
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-5">
          This question will be marked as skipped. You won't receive a score for it.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => setSkipConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={() => {
              setSkipConfirm(false);
              orchestrator.skipQuestion();
              if (isLastQ) navigate(`/app/scorecard/${orchestrator.sessionId}`);
            }}
          >
            Skip question
          </Button>
        </div>
      </Modal>

      {/* End session confirm */}
      <Modal
        open={endConfirm}
        onClose={() => setEndConfirm(false)}
        title="End session early?"
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-5">
          Your progress will be saved and you'll receive a partial scorecard.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => setEndConfirm(false)}
          >
            Continue session
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={handleEndSession}
          >
            End & save
          </Button>
        </div>
      </Modal>

      {/* Coach chat modal */}
      <CoachChatModal
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        question={question}
        transcript={stt.transcript}
        sessionId={orchestrator.sessionId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MetricRow
// ─────────────────────────────────────────────────────────────────

function MetricRow({
  label, value, max, color, unit,
}: {
  label: string;
  value: number;
  max:   number;
  color: "emerald" | "amber" | "red" | "blue";
  unit:  string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={cn(
          "text-[11px] font-bold tabular-nums",
          color === "emerald" ? "text-emerald-400" :
          color === "amber"   ? "text-amber-400"   :
          color === "red"     ? "text-red-400"      : "text-blue-400"
        )}>
          {value}{unit}
        </span>
      </div>
      <ProgressBar value={value} max={max} color={color} size="xs" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CoachChatModal
// ─────────────────────────────────────────────────────────────────

function CoachChatModal({
  open, onClose, question, transcript, sessionId,
}: {
  open:       boolean;
  onClose:    () => void;
  question:   string;
  transcript: string;
  sessionId:  string | null;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "coach"; text: string }[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Seed coach with current context on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "coach",
        text: `I can see you're answering: "${question.slice(0, 80)}…"\n\nWhat would you like help with?`,
      }]);
    }
  }, [open]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((p) => [...p, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const res = await fetch(`${EDGE_BASE}/ai-coach-chat`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          session_id:  sessionId,
          question,
          transcript,
          user_message: userMsg,
          history: messages,
        }),
      });

      const data = await res.json();
      setMessages((p) => [...p, { role: "coach", text: data.reply ?? "Sorry, I couldn't respond." }]);
    } catch {
      setMessages((p) => [...p, { role: "coach", text: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="AI Coach" size="md">
      <div className="flex flex-col h-80">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {m.role === "coach" && (
                <div className="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  AI
                </div>
              )}
              <div className={cn(
                "max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed",
                m.role === "coach"
                  ? "bg-white/8 text-gray-200 rounded-tl-none"
                  : "bg-violet-600/30 text-violet-100 rounded-tr-none"
              )}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center text-[10px] shrink-0">AI</div>
              <div className="bg-white/8 rounded-2xl rounded-tl-none px-3 py-2">
                <div className="flex gap-1">
                  {[0,1,2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask anything about this question…"
            className="flex-1 bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
          >
            Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}
