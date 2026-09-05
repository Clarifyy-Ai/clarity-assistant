import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { evaluationModeLabel, languageLabel } from "@/lib/coding/languages";
import type { ScoredCodingQuestion } from "@/lib/coding/catalog";
import { cn } from "@/lib/utils";

type CodingQuestionCardProps = {
  question: ScoredCodingQuestion;
  compact?: boolean;
};

function difficultyVariant(difficulty: string): "emerald" | "amber" | "red" {
  switch (String(difficulty).toUpperCase()) {
    case "HARD":
      return "red";
    case "MEDIUM":
      return "amber";
    default:
      return "emerald";
  }
}

function actionLabel(status: ScoredCodingQuestion["progress"]["status"]): string {
  switch (status) {
    case "passed":
      return "Retry";
    case "in_progress":
      return "Resume";
    default:
      return "Start";
  }
}

function ActionIcon({ status }: { status: ScoredCodingQuestion["progress"]["status"] }) {
  if (status === "passed") return <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function CodingQuestionCard({ question, compact = false }: CodingQuestionCardProps) {
  const { progress } = question;
  const cta = actionLabel(progress.status);

  return (
    <Link
      to={`/app/coding/${question.id}`}
      className="block min-w-0 h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl"
      aria-label={`${cta}: ${question.displayTitle}`}
      data-testid={`coding-question-card-${question.id}`}
    >
      <Card
        hover
        className={cn(
          "min-w-0 h-full flex flex-col gap-3",
          question.recommended && "border-primary/30 bg-primary/[0.03]",
        )}
      >
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {question.recommended && (
                <Badge variant="primary" size="sm" className="gap-1">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Recommended
                </Badge>
              )}
              {progress.status === "passed" && (
                <Badge variant="emerald" size="sm" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Passed
                </Badge>
              )}
              {progress.status === "in_progress" && (
                <Badge variant="amber" size="sm">
                  In progress
                </Badge>
              )}
            </div>
            <h2 className="font-semibold text-foreground line-clamp-2">{question.displayTitle}</h2>
          </div>
          <Badge variant={difficultyVariant(question.difficulty)} size="sm" className="shrink-0">
            {question.difficulty}
          </Badge>
        </div>

        {!compact && question.description?.trim() && (
          <p className="text-sm text-muted-foreground line-clamp-2">{question.description.trim()}</p>
        )}

        <div className="mt-auto space-y-3">
          <p className="text-xs text-muted-foreground">
            {languageLabel(question.language)} · {evaluationModeLabel(question.evaluation_mode)}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
            <div className="text-xs text-muted-foreground min-w-0">
              {progress.attemptCount > 0 ? (
                <span>
                  {progress.attemptCount} attempt{progress.attemptCount === 1 ? "" : "s"}
                  {progress.bestScore != null ? ` · best ${Math.round(progress.bestScore)}%` : ""}
                </span>
              ) : (
                <span>Not started</span>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary shrink-0">
              {cta}
              <ActionIcon status={progress.status} />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
