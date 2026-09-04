import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sessionDebriefsDB, scorecardsDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PublicShareLayout } from "@/components/layout/PublicShareLayout";
import { PublicErrorState } from "@/components/common/PublicErrorState";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { formatSessionScore, normalizeScoreStatus } from "@/lib/analytics/scoreStatus";
import { cn } from "@/lib/utils";
import type { DetailedReport } from "@/components/debrief/DebriefAnalyticsPanels";
import { scorecardDimensionValues } from "@/types/scorecard.types";

export default function SharedDebrief() {
  const { token } = useParams<{ token: string }>();
  const [debrief, setDebrief] = useState<Record<string, unknown> | null>(null);
  const [scorecard, setScorecard] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageMeta({
    title: `Shared session · ${PRODUCT_NAMES.brand}`,
    description: `Review a shared practice session scorecard and debrief on ${PRODUCT_NAMES.brand}.`,
    ogType: "website",
  });

  useEffect(() => {
    if (!token || !token.trim()) {
      setLoading(false);
      setError("This shared link is invalid or has expired.");
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [db, sc] = await Promise.all([
          sessionDebriefsDB.getByShareToken(token),
          scorecardsDB.getByShareToken(token),
        ]);
        if (db) {
          setDebrief(db as unknown as Record<string, unknown>);
        }
        if (sc) {
          setScorecard(sc as unknown as Record<string, unknown>);
        }
        if (!db && !sc) {
          setError("This shared link is invalid or has expired.");
        }
      } catch {
        setError("Unable to load shared session.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <PublicShareLayout>
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading shared debrief…</p>
        </div>
      </PublicShareLayout>
    );
  }

  if (error || (!debrief && !scorecard)) {
    return (
      <PublicShareLayout>
        <PublicErrorState
          title="Shared link unavailable"
          description={
            error ??
            "This shared link is invalid, expired, or has been revoked. No private session or account data is shown."
          }
          homeLabel={`Go to ${PRODUCT_NAMES.brand}`}
        />
        <p className="max-w-md mx-auto px-4 -mt-6 mb-10 text-center text-xs text-muted-foreground leading-relaxed">
          Share links are created from your signed-in Debrief or Scorecard page
          (Share button). Guests can only open a link someone already shared —
          there is no create-share control on this public page.
        </p>
      </PublicShareLayout>
    );
  }

  const isScorecardOnly = !debrief && !!scorecard;
  const pageTitle = isScorecardOnly ? "Shared scorecard" : "Session Debrief";
  const report = (debrief?.detailed_report ?? {}) as DetailedReport;
  const overallGrade = debrief?.overall_grade as string | undefined;
  const scorecardDimensions = scorecard ? scorecardDimensionValues(scorecard) : null;
  const scoredDimensions = scorecardDimensions
    ? Object.values(scorecardDimensions).filter((v): v is number => v != null)
    : [];
  const avgDimensionScore = scoredDimensions.length
    ? Math.round(scoredDimensions.reduce((sum, value) => sum + value, 0) / scoredDimensions.length)
    : null;
  const rawScore =
    scorecard != null
      ? ((scorecard.overall_score as number | null | undefined) ??
          avgDimensionScore ??
          null)
      : ((report.category_scores?.confidence as number | undefined) ?? null);
  // Prefer evaluation_status; never invent score_status. Infer "scored" from a real overall.
  const scoreStatus = normalizeScoreStatus(
    (scorecard?.evaluation_status as string | undefined) ??
      (scorecard?.score_status as string | undefined) ??
      null,
    rawScore,
  );
  const scoreLabel = formatSessionScore(rawScore, scoreStatus);
  const numericScore =
    typeof rawScore === "number" && scoreStatus === "scored" ? rawScore : null;

  const summary =
    (debrief?.summary as string | undefined) ??
    (scorecard?.coach_note as string | undefined) ??
    (scorecard?.feedback as string | undefined);
  const strengths = (debrief?.strengths ?? scorecard?.strengths) as string[] | undefined;
  const improvements = (debrief?.improvements ?? scorecard?.improvements) as
    | string[]
    | undefined;

  const scoreColor =
    (numericScore ?? 0) >= 75 ? "emerald" :
    (numericScore ?? 0) >= 55 ? "amber" : "red";

  const createdAt = debrief?.created_at ?? scorecard?.created_at ?? scorecard?.generated_at;

  return (
    <PublicShareLayout>
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="primary" size="sm">Shared read-only</Badge>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
          {createdAt && (
            <p className="text-xs text-muted-foreground">
              {format(new Date(String(createdAt)), "MMMM d, yyyy")}
            </p>
          )}
          {overallGrade && (
            <Badge variant="primary" size="sm">
              Grade {overallGrade}
            </Badge>
          )}
        </div>

        {numericScore != null && (
          <Card className="text-center py-6">
            <div
              className={cn(
                "text-5xl font-black",
                scoreColor === "emerald"
                  ? "text-emerald-400"
                  : scoreColor === "amber"
                    ? "text-amber-400"
                    : "text-red-400",
              )}
            >
              {scoreLabel}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall score</p>
            <ProgressBar
              value={numericScore}
              max={100}
              color={scoreColor}
              size="sm"
              className="mt-3 max-w-xs mx-auto"
            />
          </Card>
        )}

        {summary && (
          <Card>
            <h2 className="text-sm font-semibold mb-2">Summary</h2>
            <p className="text-sm leading-relaxed">{String(summary)}</p>
          </Card>
        )}

        {Array.isArray(strengths) && strengths.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold mb-2">Strengths</h2>
            <ul className="space-y-1">
              {strengths.map((s, i) => (
                <li key={i} className="text-xs text-foreground">
                  ✓ {s}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {Array.isArray(improvements) && improvements.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold mb-2">Improvements</h2>
            <ul className="space-y-1">
              {improvements.map((s, i) => (
                <li key={i} className="text-xs text-foreground">
                  → {s}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="text-center pt-6 space-y-2 border-t border-border mt-2">
          <p className="text-sm font-medium text-foreground">
            Ready to improve your next interview?
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Practice with {PRODUCT_NAMES.brand} — live coaching, mock interviews, and scorecards like this one.
          </p>
        </div>
      </div>
    </PublicShareLayout>
  );
}
