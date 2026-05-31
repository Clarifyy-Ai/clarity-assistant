// @ts-nocheck -- retained: complex Supabase row types with manual schema columns
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Brain, ChevronLeft, TrendingUp,
  AlertTriangle, CheckCircle, Target,
  BookOpen, Zap, Star, Clock,
  BarChart2, FlaskConical, ChevronRight,
  Lightbulb, Calendar, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { DebriefExtras } from "@/components/session/DebriefExtras";

export default function DebriefDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [debrief,    setDebrief]    = useState<any>(null);
  const [session,    setSession]    = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [genning,    setGenning]    = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Generate debrief from edge function ──────────────────────
  // FIX 1: fetchEdge returns parsed data directly — no .ok / .json()
  // FIX 5: removed user_id from body — derived server-side from auth token
  const generateDebrief = useCallback(async (sessionId: string) => {
    setGenning(true);
    try {
      const data = await fetchEdgeJson<{ debrief?: unknown; session?: unknown }>(
        "generate-debrief",
        { session_id: sessionId }
      );
      if (data?.debrief) setDebrief(data.debrief);
      if (data?.session) setSession(data.session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate debrief";
      console.error("[DebriefDetail] generateDebrief error:", err);
      toast.error(msg + ". Please try again.");
      setFetchError(msg);
    } finally {
      setGenning(false);
    }
  }, []);

  // ── Fetch existing debrief from DB ────────────────────────────
  // FIX 2: separate error from "not found" — only generate if truly not found
  // FIX 4: wrapped in useCallback with proper deps
  const fetchDebrief = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    setFetchError(null);

    try {
      const { data: db, error: dbErr } = await supabase
        .from("session_debriefs")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();  // maybeSingle returns null (not error) when row missing

      if (dbErr) {
        // Real DB error — don't accidentally trigger generation
        throw dbErr;
      }

      if (db) {
        // Found an existing debrief by its own ID
        setDebrief(db);
        if (db.session_id) {
          const { data: sess } = await supabase
            .from("sessions")
            .select("*")
            .eq("id", db.session_id)
            .maybeSingle();
          setSession(sess ?? null);
        }
      } else {
        // No debrief found by debrief ID — treat `id` as a session_id
        // and generate a new debrief for that session
        await generateDebrief(id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load debrief";
      console.error("[DebriefDetail] fetchDebrief error:", err);
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, generateDebrief]);

  // FIX 3: include user?.id in dep array so it re-runs if user loads after id
  useEffect(() => {
    fetchDebrief();
  }, [fetchDebrief]);

  // ── Derived values ────────────────────────────────────────────

  const gradeColor =
    debrief?.overall_grade?.startsWith("A") ? "emerald" :
    debrief?.overall_grade?.startsWith("B") ? "blue"    :
    debrief?.overall_grade?.startsWith("C") ? "amber"   : "red";

  // ── Loading state — initial DB fetch ─────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl space-y-5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // FIX 6: dedicated generation state — no skeletons during AI generation
  if (genning) {
    return (
      <div className="max-w-3xl flex flex-col items-center justify-center py-24 gap-5">
        <div className="w-14 h-14 rounded-2xl bg-violet-600/20 flex items-center justify-center">
          <Brain className="w-7 h-7 text-violet-400 animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Generating your debrief…
          </p>
          <p className="text-xs text-muted-foreground">
            ✨ AI is analysing your session and building a personalised action plan
          </p>
        </div>
        <div className="w-48 h-1 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] w-1/2" />
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (fetchError && !debrief) {
    return (
      <div className="text-center py-20 space-y-4">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <p className="text-sm text-muted-foreground">{fetchError}</p>
        <div className="flex gap-2 justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchDebrief}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Retry
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/app/debrief")}>
            ← Back to debriefs
          </Button>
        </div>
      </div>
    );
  }

  // ── Not found state ───────────────────────────────────────────
  if (!debrief) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Debrief not found.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/app/debrief")}>
          ← Back to debriefs
        </Button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-5">

      {/* Back nav */}
      <button
        onClick={() => navigate("/app/debrief")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Debriefs
      </button>

      {/* Hero grade card */}
      <Card className="bg-gradient-to-br from-violet-600/10 to-blue-600/10 border-violet-500/20">
        <div className="flex items-start gap-3 sm:gap-5">
          <div className={cn(
            "w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-4xl font-black border-2 shrink-0",
            gradeColor === "emerald" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" :
            gradeColor === "blue"    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"          :
            gradeColor === "amber"   ? "border-amber-500/50 bg-amber-500/10 text-amber-400"       :
                                       "border-red-500/50 bg-red-500/10 text-red-400"
          )}>
            {debrief.overall_grade ?? "—"}
          </div>

          <div className="flex-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              AI Debrief
            </p>
            <h1 className="text-base sm:text-xl font-bold text-foreground mt-1">
              {session?.session_type
                ? `${session.session_type.charAt(0).toUpperCase() + session.session_type.slice(1)} Interview`
                : "Session Debrief"}
              {session?.target_company && ` — ${session.target_company}`}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(debrief.created_at), "EEEE, MMMM d yyyy")}
            </p>
            {debrief.summary && (
              <p className="text-sm text-foreground leading-relaxed mt-3">
                {debrief.summary}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Priority focus */}
      {debrief.priority_focus && (
        <Card className="flex items-start gap-4 border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Priority focus area</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {debrief.priority_focus}
            </p>
          </div>
        </Card>
      )}

      {/* Skill gap analysis */}
      {debrief.skill_gaps?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-foreground">Skill gap analysis</h3>
          </div>
          <div className="space-y-4">
            {debrief.skill_gaps.map((gap: any, i: number) => (
              <div key={i}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-0.5">
                  <p className="text-xs font-medium text-foreground">{gap.skill}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Current: {gap.current}/10</span>
                    <span className="text-[10px] text-muted-foreground">Target: {gap.target}/10</span>
                  </div>
                </div>
                <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 h-full w-0.5 bg-violet-400 z-10"
                    style={{ left: `${gap.target * 10}%` }}
                  />
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      gap.current >= gap.target         ? "bg-emerald-500" :
                      gap.current >= gap.target - 2     ? "bg-amber-500"   : "bg-red-500"
                    )}
                    style={{ width: `${gap.current * 10}%` }}
                  />
                </div>
                {gap.note && (
                  <p className="text-[10px] text-muted-foreground mt-1">{gap.note}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Strengths + improvements */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {debrief.strengths?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-foreground">What went well</h3>
            </div>
            <ul className="space-y-2">
              {debrief.strengths.map((s: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>{s}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {debrief.improvements?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">To improve</h3>
            </div>
            <ul className="space-y-2">
              {debrief.improvements.map((s: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="text-amber-500 shrink-0 mt-0.5">→</span>{s}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* 7-day action plan */}
      {debrief.action_plan?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">7-day action plan</h3>
          </div>
          <div className="space-y-3">
            {debrief.action_plan.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-secondary border border-border rounded-xl">
                <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center text-[11px] font-bold text-blue-400 shrink-0">
                  D{step.day ?? i + 1}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{step.title}</p>
                  {step.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  )}
                  {step.time_estimate && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{step.time_estimate}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Study resources */}
      {debrief.resources?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">Recommended resources</h3>
          </div>
          <div className="space-y-2">
            {debrief.resources.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 bg-secondary border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <span className="text-lg">{
                    r.type === "video"   ? "🎥" :
                    r.type === "book"    ? "📚" :
                    r.type === "article" ? "📰" :
                    r.type === "course"  ? "🎓" : "🔗"
                  }</span>
                  <div>
                    <p className="text-xs font-medium text-foreground">{r.title}</p>
                    {r.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.description}</p>
                    )}
                  </div>
                </div>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors shrink-0 ml-3"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Next session goals */}
      {debrief.next_session_goals?.length > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-foreground">Goals for your next session</h3>
          </div>
          <ul className="space-y-2">
            {debrief.next_session_goals.map((g: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="text-emerald-500 shrink-0 tabular-nums mt-0.5">{i + 1}.</span>
                {g}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* AI insight */}
      {debrief.insight && (
        <Card className="flex items-start gap-4 bg-violet-600/10 border-violet-500/20">
          <Lightbulb className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-violet-300 mb-1">AI insight</p>
            <p className="text-sm text-foreground leading-relaxed italic">
              "{debrief.insight}"
            </p>
          </div>
        </Card>
      )}

      {/* Sprint B extras */}
      <DebriefExtras
        debriefId={debrief.id}
        wpmSeries={debrief.detailed_report?.wpm_series}
        missedKeywords={debrief.detailed_report?.missed_keywords}
        speakers={debrief.detailed_report?.speakers}
        initialRating={debrief.detailed_report?.rating ?? null}
      />

      {/* CTA row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => navigate(`/app/sessions/${debrief.session_id}`)}
          leftIcon={<BarChart2 className="w-4 h-4" />}
        >
          View scorecard
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          onClick={() => navigate("/app/mock")}
          leftIcon={<FlaskConical className="w-4 h-4" />}
          rightIcon={<ChevronRight className="w-4 h-4" />}
        >
          Practice again
        </Button>
      </div>
    </div>
  );
}
