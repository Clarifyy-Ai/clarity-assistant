// src/components/session/PostSessionSummary.tsx
import { Link } from "react-router-dom";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  buildNextStepSuggestion,
  formatDuration,
  loadLastSessionSummary,
  type LastSessionSummary,
} from "@/lib/session/lastSessionSummary";

interface PostSessionSummaryProps {
  sessionId: string;
  onStartNew: () => void;
}

function resolveSummary(sessionId: string): LastSessionSummary | null {
  return loadLastSessionSummary(sessionId);
}

export function PostSessionSummary({ sessionId, onStartNew }: PostSessionSummaryProps) {
  const summary = resolveSummary(sessionId);
  const durationLabel = summary
    ? formatDuration(summary.durationSeconds)
    : "Just now";
  const questions = summary?.questionsDetected ?? 0;
  const hints = summary?.hintsUsed ?? 0;
  const incompleteNoAnswers = questions === 0;
  const nextStep = buildNextStepSuggestion(summary);

  if (incompleteNoAnswers) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md px-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-1">
            <ClipboardCheck className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">Session incomplete</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-normal">
              No answers were recorded, so this session was saved without a scorecard or a fake
              zero score. Answer at least one question in a new session to unlock scoring and
              debrief.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
            <Button variant="primary" size="sm" onClick={onStartNew}>
              Start New Session
            </Button>
            <Link
              to="/app/sessions"
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium rounded-xl transition-all"
            >
              Back to sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const bullets = [
    `Duration: ${durationLabel}`,
    `Questions heard: ${questions} · Hints used: ${hints}`,
    `Next: ${nextStep}`,
  ];

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-1">
          <ClipboardCheck className="w-6 h-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">Session ended</p>
          <p className="text-sm text-muted-foreground">
            Quick takeaways — dig deeper anytime.
          </p>
        </div>

        <ul className="text-left space-y-2.5 rounded-2xl border border-border bg-card/60 px-4 py-3.5">
          {bullets.map((text) => (
            <li key={text} className="flex gap-2.5 text-sm text-foreground/90 leading-snug">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
          <Link
            to={`/app/scorecard/${sessionId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary text-sm font-medium rounded-xl transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            View Scorecard
          </Link>
          <Link
            to={`/app/debrief/${sessionId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium rounded-xl transition-all"
          >
            Open Debrief
          </Link>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={onStartNew}
          >
            Start New Session
          </Button>
        </div>
      </div>
    </div>
  );
}
