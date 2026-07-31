import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { sessionDebriefsDB, scorecardsDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/marketing";
import { AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
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
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Shared via{" "}
        <Link to="/" className="text-primary hover:underline">
          Clarify AI
        </Link>
        {" · "}
        Practice-only interview coaching
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

  useEffect(() => {
    if (!token) return;
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
        <div className="flex flex-col items-center justify-center gap-4 px-4 py-24">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className="text-muted-foreground text-sm text-center">{error ?? "Not found"}</p>
          <Link to="/" className="text-sm text-primary hover:underline">
            Go to Clarify AI
          </Link>
        </div>
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

        <div className="text-center pt-4">
          <Link
            to="/signup"
            className="inline-flex text-sm font-semibold text-primary hover:underline"
          >
            Practice with Clarify AI →
          </Link>
        </div>
      </div>
    </SharedShell>
  );
}
