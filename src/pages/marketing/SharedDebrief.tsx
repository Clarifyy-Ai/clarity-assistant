import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { sessionDebriefsDB, scorecardsDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/marketing";
import { Loader2 } from "lucide-react";
import { PublicErrorState } from "@/components/common/PublicErrorState";
import { format } from "date-fns";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { cn } from "@/lib/utils";
import type { DetailedReport } from "@/components/debrief/DebriefAnalyticsPanels";

function SharedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <BrandLogo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/signup"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border py-8 px-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Shared via {PRODUCT_NAMES.brand} — practice-only interview coaching
        </p>
        <Link
          to="/signup"
          className="inline-flex text-sm font-semibold px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90"
        >
          Start practicing free
        </Link>
      </footer>
    </div>
  );
}

export default function SharedDebrief() {
  const { token } = useParams<{ token: string }>();
  const [debrief, setDebrief] = useState<Record<string, unknown> | null>(null);
  const [scorecard, setScorecard] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageMeta({
    title: `Shared session · ${PRODUCT_NAMES.brand}`,
    description: "Review a shared practice session scorecard and debrief on Clarify AI.",
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
        } else if (sc) {
          setScorecard(sc as unknown as Record<string, unknown>);
        } else {
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
      <SharedShell>
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading shared debrief…</p>
        </div>
      </SharedShell>
    );
  }

  if (error || (!debrief && !scorecard)) {
    return (
      <SharedShell>
        <PublicErrorState
          title="Shared link unavailable"
          description={
            error ??
            "This shared link is invalid, expired, or has been revoked. No private account data is shown."
          }
          homeLabel="Go to Clarify AI"
        />
      </SharedShell>
    );
  }

  const report = (debrief?.detailed_report ?? {}) as DetailedReport;
  const overallScore =
    (scorecard?.overall_score as number | undefined) ??
    (report.category_scores?.confidence as number | undefined);

  const scoreColor =
    (overallScore ?? 0) >= 75 ? "emerald" :
    (overallScore ?? 0) >= 55 ? "amber" : "red";

  return (
    <SharedShell>
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="primary" size="sm">Shared read-only</Badge>
          <h1 className="text-2xl font-bold">Session Debrief</h1>
          {debrief?.created_at && (
            <p className="text-xs text-muted-foreground">
              {format(new Date(String(debrief.created_at)), "MMMM d, yyyy")}
            </p>
          )}
        </div>

        {overallScore != null && (
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
              {overallScore}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall score</p>
            <ProgressBar
              value={overallScore}
              max={100}
              color={scoreColor}
              size="sm"
              className="mt-3 max-w-xs mx-auto"
            />
          </Card>
        )}

        {debrief?.summary && (
          <Card>
            <h2 className="text-sm font-semibold mb-2">Summary</h2>
            <p className="text-sm leading-relaxed">{String(debrief.summary)}</p>
          </Card>
        )}

        {Array.isArray(debrief?.strengths) && debrief.strengths.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold mb-2">Strengths</h2>
            <ul className="space-y-1">
              {(debrief.strengths as string[]).map((s, i) => (
                <li key={i} className="text-xs text-foreground">
                  ✓ {s}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {Array.isArray(debrief?.improvements) && debrief.improvements.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold mb-2">Improvements</h2>
            <ul className="space-y-1">
              {(debrief.improvements as string[]).map((s, i) => (
                <li key={i} className="text-xs text-foreground">
                  → {s}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="text-center pt-6 space-y-3 border-t border-border mt-2">
          <p className="text-sm font-medium text-foreground">
            Ready to improve your next interview?
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Practice with Clarify AI — live coaching, mock interviews, and scorecards like this one.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 min-h-11"
            >
              Get started free
            </Link>
            <Link
              to="/login"
              className="inline-flex text-sm font-medium text-primary hover:underline min-h-11 items-center"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    </SharedShell>
  );
}
