import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import type {
  ExamReadinessSummary,
  TopicMasterySummary,
} from "@/lib/gov-exam/api";
import { listWeakTopics, type TopicMasteryRow } from "@/lib/gov-exam/masteryEngine";
import { cn } from "@/lib/utils";

type Props = {
  examName?: string;
  examCode?: string;
  readiness: ExamReadinessSummary | null;
  masteryRows: TopicMasterySummary[];
  generateHref?: string;
  className?: string;
  compact?: boolean;
};

function toEngineRows(rows: TopicMasterySummary[]): TopicMasteryRow[] {
  return rows.map((r) => ({
    topic: r.topic,
    mastery_score: Number(r.mastery_score) || 0,
    state: r.state as TopicMasteryRow["state"],
    evidence_count: Number(r.evidence_count) || 0,
  }));
}

export function GovExamReadinessPanel({
  examName,
  examCode,
  readiness,
  masteryRows,
  generateHref,
  className,
  compact,
}: Props): React.ReactElement {
  const assessed = masteryRows.filter((r) => r.evidence_count > 0);
  const weak = listWeakTopics(toEngineRows(masteryRows), 5);
  const score = readiness?.score;
  const action =
    readiness?.breakdown?.recommended_action ??
    (assessed.length === 0
      ? "No mastery data yet — finish a practice paper linked to this exam to unlock readiness."
      : "Keep practicing; readiness will refresh after each scored attempt.");

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-gradient-to-br from-background to-muted/20 p-5 space-y-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Exam readiness
          </p>
          <h3 className="text-base font-semibold mt-0.5">
            {examName ?? examCode ?? "Your prep"}
          </h3>
        </div>
        <div className="text-right">
          {typeof score === "number" && assessed.length > 0 ? (
            <>
              <p className="text-2xl font-bold tabular-nums">{Math.round(score)}</p>
              <p className="text-[11px] text-muted-foreground">
                from your attempts · not a percentile
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-muted-foreground">—</p>
              <p className="text-[11px] text-muted-foreground">No estimate yet</p>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-foreground/90 flex gap-2">
        <Target className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>{action}</span>
      </p>

      {!compact && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Weak topics</p>
          {weak.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {assessed.length === 0
                ? "Complete a scored practice set to surface weak topics."
                : "No weak topics flagged yet among assessed topics."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {weak.map((w) => (
                <li
                  key={w.topic}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300"
                  title={`Mastery ${(w.mastery_score * 100).toFixed(0)}% · ${w.state} · ${w.evidence_count} evidence`}
                >
                  {w.topic}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {generateHref && (
        <Link
          to={generateHref}
          className="inline-flex text-sm text-primary hover:underline underline-offset-2"
        >
          Generate adaptive practice →
        </Link>
      )}
    </section>
  );
}
