// @ts-nocheck -- retained: Supabase row types not in generated schema
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Brain, ChevronRight, AlertTriangle,
  CalendarDays, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// Debrief — list of all AI-generated post-session debriefs
// ─────────────────────────────────────────────────────────────────

export default function Debrief() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [debriefs,   setDebriefs]   = useState<any[]>([]);
  const [sessions,   setSessions]   = useState<Record<string, any>>({});
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Fetch debriefs + enrich with session data ─────────────────
  // FIX 1: Separate queries instead of embedded join.
  // The embedded join sessions(...) requires a FK on session_debriefs.session_id
  // which is not guaranteed in the schema. Separate queries are always safe.
  const fetchDebriefs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFetchError(null);

    try {
      // Step 1: fetch debriefs
      const { data: debriefRows, error: debriefErr } = await supabase
        .from("session_debriefs")
        .select("id, created_at, overall_grade, priority_focus, session_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (debriefErr) throw debriefErr;
      if (!debriefRows?.length) {
        setDebriefs([]);
        return;
      }

      // Step 2: fetch the linked sessions in one query
      const sessionIds = [...new Set(debriefRows.map((d) => d.session_id).filter(Boolean))];
      const { data: sessionRows, error: sessErr } = await supabase
        .from("sessions")
        .select("id, overall_score, session_type, target_company, created_at")
        .in("id", sessionIds);

      if (sessErr) {
        // Non-fatal — debriefs still show without session metadata
        console.warn("[Debrief] Failed to fetch sessions:", sessErr.message);
      }

      // Build lookup map: session_id → session row
      const sessionMap: Record<string, any> = {};
      for (const s of sessionRows ?? []) {
        sessionMap[s.id] = s;
      }

      setDebriefs(debriefRows);
      setSessions(sessionMap);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load debriefs");
    } finally {
      setLoading(false);  // FIX 2: always runs — spinner never gets stuck
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDebriefs();
  }, [fetchDebriefs]);

  // ── Grade colour ──────────────────────────────────────────────
  // FIX 4: Handle A-, B-, B+, C+, C- — check startsWith instead of strict equality
  const gradeColor = (g: string) => {
    if (!g) return "red";
    const base = g.charAt(0).toUpperCase();
    if (base === "A") return "emerald";
    if (base === "B") return "blue";
    if (base === "C") return "amber";
    return "red";
  };

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-5 max-w-3xl">
        <PageHeader title="Debriefs" subtitle="Deep-dive AI analysis of each session" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Debriefs"
        subtitle="Deep-dive AI analysis of each session"
      />

      {/* ── Error state ──────────────────────────────── */}
      {fetchError && (
        <Card className="text-center py-10">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={fetchDebriefs}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Retry
          </Button>
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────── */}
      {!fetchError && debriefs.length === 0 && (
        <Card className="text-center py-16">
          <Brain className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No debriefs yet.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Complete a mock session to get your first debrief.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => navigate("/app/mock")}
          >
            Start mock session
          </Button>
        </Card>
      )}

      {/* ── Debrief list ──────────────────────────────── */}
      {!fetchError && debriefs.length > 0 && (
        <div className="space-y-3">
          {debriefs.map((d) => {
            // FIX 1: look up session from separate map instead of d.sessions
            const sess = sessions[d.session_id] ?? null;
            const gc   = gradeColor(d.overall_grade);

            return (
              <Card
                key={d.id}
                hover
                onClick={() => navigate(`/app/debrief/${d.id}`)}
              >
                <div className="flex items-start gap-4">
                  {/* Grade bubble */}
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-lg font-black border",
                    gc === "emerald" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                    gc === "blue"    ? "bg-blue-500/10 border-blue-500/20 text-blue-400"          :
                    gc === "amber"   ? "bg-amber-500/10 border-amber-500/20 text-amber-400"       :
                                       "bg-red-500/10 border-red-500/20 text-red-400"
                  )}>
                    {d.overall_grade ?? "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {sess?.session_type ?? "Session"} Interview
                        {sess?.target_company && ` — ${sess.target_company}`}
                      </p>
                      {sess?.overall_score != null && (
                        <Badge
                          variant={
                            sess.overall_score >= 75 ? "emerald" :
                            sess.overall_score >= 55 ? "amber"   : "red"
                          }
                          size="sm"
                        >
                          {sess.overall_score}/100
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(d.created_at), "MMM d, yyyy · h:mm a")}
                    </p>

                    {d.priority_focus && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300">
                          Focus: {d.priority_focus}
                        </p>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
