// @ts-nocheck -- retained: complex Supabase row types with manual schema columns not in generated types; removing suppression produces implicit-any cascade across all data accesses.
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard, SkeletonText } from "@/components/ui/SkeletonLoader";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import {
  BarChart2, Clock, MessageSquare, Download,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Star, Zap, AlertTriangle, CheckCircle,
  Brain, Mic, Volume2, TrendingUp,
  RefreshCw, ThumbsUp, Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// SessionDetail — full scorecard + per-question review
// ─────────────────────────────────────────────────────────────────

export default function SessionDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [session,    setSession]    = useState<any>(null);
  const [answers,    setAnswers]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});
  const [chatOpen,   setChatOpen]   = useState(false);
  const [shareOpen,  setShareOpen]  = useState(false);

  // ── Fetch session + answers ───────────────────────────────────

  useEffect(() => {
    if (!id || !user) return;
    fetchSession();
  }, [id, user?.id]);

  async function fetchSession() {
    setLoading(true);

    const [{ data: sess }, { data: ans }] = await Promise.all([
      supabase
        .from("sessions")
        .select("*")
        .eq("id", id!)
        .eq("user_id", user!.id)
        .single(),
      supabase
        .from("session_answers")
        .select("*")
        .eq("session_id", id!)
        .order("question_index", { ascending: true }),
    ]);

    setSession(sess);
    setAnswers(ans ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-5 max-w-4xl">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Session not found.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/app/sessions")}>
          ← Back to sessions
        </Button>
      </div>
    );
  }

  const score = session.overall_score ?? 0;
  const scoreColor =
    score >= 80 ? "emerald" :
    score >= 60 ? "amber"   : "red";

  const scoreTier =
    score >= 85 ? "Excellent 🎉" :
    score >= 70 ? "Good 👍"      :
    score >= 55 ? "Fair 😐"      : "Needs work 💪";

  const duration = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s`
    : "—";

  return (
    <div className="max-w-4xl space-y-5">

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/app/sessions")}
            className="p-2 rounded-xl bg-accent/5 hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-all shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground capitalize truncate">
              {session.session_type} Interview
              {session.target_company && ` — ${session.target_company}`}
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5">
              {format(new Date(session.created_at), "EEEE, MMMM d yyyy · h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShareOpen(true)}
            leftIcon={<Share2 className="w-3.5 h-3.5" />}
          >
            Share
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={() => {/* PDF export handler */}}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* ── Overall scorecard ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Main score */}
        <Card className="sm:col-span-1 flex flex-col items-center justify-center py-6 text-center">
          <div className={cn(
            "text-4xl sm:text-6xl font-black mb-1",
            scoreColor === "emerald" ? "text-emerald-400" :
            scoreColor === "amber"   ? "text-amber-400"   : "text-red-400"
          )}>
            {score}
          </div>
          <p className="text-foreground text-sm font-medium">{scoreTier}</p>
          <p className="text-muted-foreground text-xs mt-1">Overall score</p>
          <ProgressBar
            value={score}
            max={100}
            color={scoreColor}
            size="sm"
            className="mt-4 w-32"
          />
        </Card>

        {/* Dimension scores */}
        <Card className="sm:col-span-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Dimension breakdown
          </h3>
          <div className="space-y-3">
            {[
              { label: "Content & Relevance",  key: "content_score"     },
              { label: "Structure (STAR)",      key: "structure_score"   },
              { label: "Communication",         key: "communication_score"},
              { label: "Confidence & Delivery", key: "confidence_score"  },
            ].map((dim) => {
              const val = session[dim.key] ?? 0;
              const c   = val >= 75 ? "emerald" : val >= 50 ? "amber" : "red";
              return (
                <div key={dim.key} className="flex items-center gap-3">
                  <span className="text-[10px] sm:text-xs text-muted-foreground w-28 sm:w-40 shrink-0">{dim.label}</span>
                  <ProgressBar value={val} max={100} color={c} size="sm" className="flex-1" />
                  <span className={cn(
                    "text-xs font-bold w-8 text-right tabular-nums",
                    c === "emerald" ? "text-emerald-400" :
                    c === "amber"   ? "text-amber-400"   : "text-red-400"
                  )}>
                    {val}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Session stats row ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon:  <Clock className="w-4 h-4 text-blue-400" />,
            label: "Duration",
            value: duration,
          },
          {
            icon:  <MessageSquare className="w-4 h-4 text-violet-400" />,
            label: "Questions",
            value: `${answers.length} / ${session.question_count ?? answers.length}`,
          },
          {
            icon:  <Volume2 className="w-4 h-4 text-emerald-400" />,
            label: "Avg WPM",
            value: session.avg_wpm ? `${session.avg_wpm}` : "—",
          },
          {
            icon:  <AlertTriangle className="w-4 h-4 text-amber-400" />,
            label: "Total fillers",
            value: session.total_filler_words ?? "—",
          },
        ].map((stat) => (
          <Card key={stat.label} padding="sm" className="flex items-center gap-3">
            {stat.icon}
            <div>
              <p className="text-sm font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── AI Overall Feedback ────────────────────────── */}
      {session.ai_feedback && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">AI Feedback Summary</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {session.ai_feedback}
          </p>

          {/* Strengths + improvements */}
          {session.strengths?.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Strengths
                </p>
                <ul className="space-y-1.5">
                  {session.strengths.map((s: string, i: number) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Areas to improve
                </p>
                <ul className="space-y-1.5">
                  {(session.improvements ?? []).map((s: string, i: number) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Per-question review ────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          Question-by-question review
        </h2>
        <div className="space-y-3">
          {answers.map((ans, i) => {
            const isOpen = expanded[ans.id];
            const qScore = ans.score ?? null;
            const qColor =
              qScore === null    ? "gray"    :
              qScore >= 75       ? "emerald" :
              qScore >= 50       ? "amber"   : "red";

            return (
              <Card key={ans.id} padding="sm">
                {/* Row header */}
                <button
                  className="w-full flex items-start gap-3 text-left"
                  onClick={() => setExpanded((p) => ({ ...p, [ans.id]: !p[ans.id] }))}
                >
                  {/* Index bubble */}
                  <div className="w-7 h-7 bg-secondary rounded-lg flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 mt-0.5">
                    {i + 1}
                  </div>

                  {/* Question */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {ans.question_text}
                    </p>
                    {ans.question_tags?.length > 0 && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {ans.question_tags.map((t: string) => (
                          <Badge key={t} variant="gray" size="sm">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score chip + chevron */}
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {qScore !== null && (
                      <span className={cn(
                        "text-sm font-black px-2 py-0.5 rounded-lg",
                        qColor === "emerald" ? "bg-emerald-500/10 text-emerald-400" :
                        qColor === "amber"   ? "bg-amber-500/10 text-amber-400"     :
                        qColor === "red"     ? "bg-red-500/10 text-red-400"         :
                                              "bg-secondary text-muted-foreground"
                      )}>
                        {qScore}
                      </span>
                    )}
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="mt-4 space-y-4 pt-4 border-t border-border">

                    {/* Transcript */}
                    {ans.transcript && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                          Your answer
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                          {ans.transcript}
                        </p>
                      </div>
                    )}

                    {/* Per-Q dimension scores */}
                    {(ans.content_score || ans.structure_score) && (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Content",    val: ans.content_score       },
                          { label: "Structure",  val: ans.structure_score     },
                          { label: "Delivery",   val: ans.communication_score },
                          { label: "Confidence", val: ans.confidence_score    },
                        ].filter((d) => d.val !== null && d.val !== undefined)
                          .map((d) => (
                            <div key={d.label} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-20 shrink-0">{d.label}</span>
                              <ProgressBar
                                value={d.val}
                                max={100}
                                color={d.val >= 70 ? "emerald" : d.val >= 50 ? "amber" : "red"}
                                size="xs"
                                className="flex-1"
                              />
                              <span className="text-xs font-bold text-foreground w-6 text-right">{d.val}</span>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Metrics row */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {ans.wpm        && <span className="flex items-center gap-1"><Mic className="w-3 h-3" />{ans.wpm} WPM</span>}
                      {ans.filler_count !== null && <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{ans.filler_count} fillers</span>}
                      {ans.duration_seconds && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ans.duration_seconds}s</span>}
                    </div>

                    {/* AI feedback for this question */}
                    {ans.ai_feedback && (
                      <div className="bg-secondary border border-border rounded-xl p-4">
                        <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-2">
                          AI feedback
                        </p>
                        <p className="text-xs text-foreground leading-relaxed">
                          {ans.ai_feedback}
                        </p>
                      </div>
                    )}

                    {/* Model answer */}
                    {ans.model_answer && (
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
                        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest mb-2">
                          Model answer
                        </p>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {ans.model_answer}
                        </p>
                      </div>
                    )}

                    {/* STAR breakdown */}
                    {ans.star_breakdown && (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(ans.star_breakdown).map(([key, val]) => (
                          <div key={key} className="bg-secondary border border-border rounded-xl p-3">
                            <p className="text-[10px] font-bold text-violet-400 uppercase mb-1">{key}</p>
                            <p className="text-xs text-muted-foreground">{val as string}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Save to Answer Bank */}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        leftIcon={<Star className="w-3 h-3" />}
                        onClick={async () => {
                          try {
                            const { error } = await supabase.from("answer_bank").insert({
                              user_id:       user?.id,
                              session_id:    ans.session_id,
                              question_text: ans.question_text,
                              answer_text:   ans.transcript,
                              score:         ans.score,
                            });
                            if (error) throw error;
                            toast.success("Saved to Answer Bank");
                          } catch (err) {
                            toast.error(err?.message ?? "Failed to save answer.");
                          }
                        }}
                      >
                        Save to Answer Bank
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        leftIcon={<RefreshCw className="w-3 h-3" />}
                        onClick={() => setChatOpen(true)}
                      >
                        Drill this
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Debrief CTA ───────────────────────────────── */}
      <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 bg-gradient-to-r from-violet-600/10 to-blue-600/10 border-violet-500/20">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Deep-dive debrief</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-generated action plan, gap analysis, and what to study next.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="w-full sm:w-auto shrink-0"
          onClick={() => navigate(`/app/debrief/${session.id}`)}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          View debrief
        </Button>
      </Card>

      {/* ── Modals ─────────────────────────────────────── */}

      {/* Share modal */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share scorecard" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share a public read-only link to this scorecard.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={`https://confideq.app/share/${session.id}`}
              className="flex-1 bg-background border border-input text-foreground rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-ring transition-colors"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(`https://confideq.app/share/${session.id}`)}
            >
              Copy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
