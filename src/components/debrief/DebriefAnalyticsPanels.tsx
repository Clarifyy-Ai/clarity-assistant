// Debrief analytics panels — session meta, Q&A, timeline, keywords, vocal charts, confidence
import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BarChart2, CheckCircle, Clock,
  HelpCircle, MessageSquare, Share2, Tags, TrendingUp, XCircle,
} from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const WPM_BENCHMARK = 125;
const CONFIDENCE_DIMS = [
  {
    key: "communication",
    label: "Communication",
    description: "Clarity, articulation, and how easily your message lands with the listener.",
  },
  {
    key: "confidence",
    label: "Confidence",
    description: "Vocal steadiness, pace control, and delivery presence under pressure.",
  },
  {
    key: "technical",
    label: "Technical depth",
    description: "Accuracy and depth of domain knowledge in your answers.",
  },
  {
    key: "problem_solving",
    label: "Problem solving",
    description: "Structured thinking, trade-offs, and approach to open-ended questions.",
  },
] as const;

export type KeywordCoverageItem = {
  keyword: string;
  covered: boolean;
  coverage_pct: number;
  suggestion?: string;
};

export type SessionEvent = {
  id: string;
  label: string;
  detail?: string;
  at_ms: number;
  type: "start" | "question" | "answer" | "transcript" | "end" | "other";
};

export type DetailedReport = {
  wpm_series?: { t: number; wpm: number }[];
  filler_series?: { t: number; count: number }[];
  pause_series?: { bucket: string; count: number }[];
  confidence_series?: { t: number; score: number }[];
  missed_keywords?: string[];
  keyword_coverage?: KeywordCoverageItem[];
  jd_keywords?: string[];
  speakers?: { id: string; label: string }[];
  share_token?: string;
  is_shared?: boolean;
  category_scores?: Record<string, number>;
  rating?: 1 | -1 | null;
};

type AnswerRow = {
  id: string;
  question: string;
  answer: string;
  score?: number | null;
  ai_feedback?: string | null;
  created_at?: string;
};

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function deriveDuration(session: Record<string, unknown> | null): number | null {
  if (!session) return null;
  if (typeof session.duration_seconds === "number") return session.duration_seconds;
  const start = session.started_at ?? session.created_at;
  const end = session.ended_at;
  if (start && end) {
    const ms = new Date(String(end)).getTime() - new Date(String(start)).getTime();
    if (ms > 0) return Math.round(ms / 1000);
  }
  return null;
}

function buildKeywordCoverage(
  report: DetailedReport | null | undefined,
  transcript: string | null,
): KeywordCoverageItem[] {
  if (report?.keyword_coverage?.length) return report.keyword_coverage;

  const jdKeywords = report?.jd_keywords ?? [];
  const missed = new Set((report?.missed_keywords ?? []).map((k) => k.toLowerCase()));
  const lowerTx = (transcript ?? "").toLowerCase();

  const allKeywords = jdKeywords.length
    ? jdKeywords
    : (report?.missed_keywords ?? []);

  if (!allKeywords.length) return [];

  return allKeywords.map((keyword) => {
    const covered = !missed.has(keyword.toLowerCase()) && lowerTx.includes(keyword.toLowerCase());
    return {
      keyword,
      covered,
      coverage_pct: covered ? 100 : 0,
      suggestion: covered
        ? undefined
        : `Mention "${keyword}" with a concrete example from your experience.`,
    };
  });
}

function highlightTranscript(
  transcript: string,
  keywords: KeywordCoverageItem[],
): React.ReactNode {
  if (!transcript || !keywords.length) return transcript;

  const parts: React.ReactNode[] = [];
  let remaining = transcript;
  let key = 0;

  while (remaining.length > 0) {
    let earliest = { index: -1, len: 0, covered: false, word: "" };
    for (const kw of keywords) {
      const idx = remaining.toLowerCase().indexOf(kw.keyword.toLowerCase());
      if (idx >= 0 && (earliest.index < 0 || idx < earliest.index)) {
        earliest = { index: idx, len: kw.keyword.length, covered: kw.covered, word: kw.keyword };
      }
    }
    if (earliest.index < 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (earliest.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, earliest.index)}</span>);
    }
    parts.push(
      <mark
        key={key++}
        className={cn(
          "rounded px-0.5",
          earliest.covered
            ? "bg-emerald-500/25 text-emerald-200"
            : "bg-red-500/25 text-red-200",
        )}
      >
        {remaining.slice(earliest.index, earliest.index + earliest.len)}
      </mark>,
    );
    remaining = remaining.slice(earliest.index + earliest.len);
  }

  return parts;
}

// ── Session metadata + scores ─────────────────────────────────────

export function DebriefSessionMeta({
  session,
  debrief,
  scorecard,
}: {
  session: Record<string, unknown> | null;
  debrief: Record<string, unknown>;
  scorecard: Record<string, unknown> | null;
}) {
  const durationSec = deriveDuration(session);
  const overallScore =
    (session?.overall_score as number | null) ??
    (scorecard?.overall_score as number | null) ??
    null;

  const categoryScores: Record<string, number> = {
    communication: (scorecard?.communication as number) ?? (session?.clarity_score as number) ?? 0,
    confidence: (scorecard?.confidence as number) ?? (session?.confidence_score as number) ?? 0,
    technical: (scorecard?.technical as number) ?? 0,
    problem_solving: (scorecard?.problem_solving as number) ?? 0,
    ...(debrief.detailed_report as DetailedReport | undefined)?.category_scores,
  };

  const scoreColor =
    (overallScore ?? 0) >= 75 ? "emerald" :
    (overallScore ?? 0) >= 55 ? "amber" : "red";

  const sessionType = String(session?.type ?? session?.session_type ?? "session");
  const company = session?.target_company ?? session?.company ?? session?.title;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <Clock className="w-4 h-4 text-blue-400" />,
            label: "Duration",
            value: formatDuration(durationSec),
          },
          {
            icon: <BarChart2 className="w-4 h-4 text-primary" />,
            label: "Type",
            value: sessionType.replace(/_/g, " "),
          },
          {
            icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
            label: "Date",
            value: format(new Date(String(debrief.created_at)), "MMM d, yyyy"),
          },
          {
            icon: <Activity className="w-4 h-4 text-amber-400" />,
            label: "Avg WPM",
            value: session?.avg_wpm ? String(session.avg_wpm) : "—",
          },
        ].map((stat) => (
          <Card key={stat.label} padding="sm" className="flex items-center gap-3">
            {stat.icon}
            <div>
              <p className="text-sm font-bold text-foreground capitalize">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {company && (
        <p className="text-xs text-muted-foreground">
          {String(company)}
          {durationSec && session?.started_at && (
            <> · {formatDistanceStrict(new Date(String(session.started_at ?? session.created_at)), new Date(String(session.ended_at ?? debrief.created_at)))}</>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center justify-center py-6 text-center">
          <div className={cn(
            "text-4xl font-black mb-1",
            scoreColor === "emerald" ? "text-emerald-400" :
            scoreColor === "amber" ? "text-amber-400" : "text-red-400",
          )}>
            {overallScore ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground">Overall score</p>
          {debrief.overall_grade && (
            <Badge variant="primary" size="sm" className="mt-2">
              Grade {String(debrief.overall_grade)}
            </Badge>
          )}
          {overallScore != null && (
            <ProgressBar value={overallScore} max={100} color={scoreColor} size="sm" className="mt-3 w-28" />
          )}
        </Card>

        <Card className="sm:col-span-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Score by category
          </h3>
          <div className="space-y-3">
            {CONFIDENCE_DIMS.map((dim) => {
              const val = categoryScores[dim.key] ?? 0;
              const c = val >= 75 ? "emerald" : val >= 55 ? "amber" : "red";
              return (
                <div key={dim.key} className="flex items-center gap-3">
                  <span className="text-[10px] sm:text-xs text-muted-foreground w-28 sm:w-36 shrink-0">
                    {dim.label}
                  </span>
                  <ProgressBar value={val} max={100} color={c} size="sm" className="flex-1" />
                  <span className={cn(
                    "text-xs font-bold w-8 text-right tabular-nums",
                    c === "emerald" ? "text-emerald-400" :
                    c === "amber" ? "text-amber-400" : "text-red-400",
                  )}>
                    {val || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Questions + AI answers ────────────────────────────────────────

export function DebriefQuestionsList({ answers }: { answers: AnswerRow[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!answers.length) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Questions & AI answers</h3>
        <Badge variant="gray" size="sm">{answers.length}</Badge>
      </div>
      <div className="space-y-3">
        {answers.map((a, i) => {
          const open = expanded[a.id] ?? i === 0;
          return (
            <div key={a.id} className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-start gap-3 p-3 text-left hover:bg-secondary/50 transition-colors"
                onClick={() => setExpanded((e) => ({ ...e, [a.id]: !open }))}
              >
                <span className="text-[10px] font-bold text-primary shrink-0 mt-0.5">Q{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{a.question}</p>
                  {a.score != null && (
                    <p className="text-[10px] text-muted-foreground mt-1">Score: {a.score}/100</p>
                  )}
                </div>
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/50">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap pt-2">
                    {a.answer || "No answer recorded."}
                  </p>
                  {a.ai_feedback && (
                    <div className="rounded-lg bg-primary/10 border border-primary/20 p-2">
                      <p className="text-[10px] font-semibold text-primary/80 mb-1">AI feedback</p>
                      <p className="text-[11px] text-foreground leading-relaxed">{a.ai_feedback}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Event timeline ──────────────────────────────────────────────

export function DebriefEventTimeline({ events }: { events: SessionEvent[] }) {
  if (!events.length) return null;

  const sorted = [...events].sort((a, b) => a.at_ms - b.at_ms);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-foreground">Session timeline</h3>
      </div>
      <ol className="relative border-l border-border ml-2 space-y-4 pl-4">
        {sorted.map((ev) => (
          <li key={ev.id} className="relative">
            <span className={cn(
              "absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full border-2 border-background",
              ev.type === "start" ? "bg-emerald-500" :
              ev.type === "end" ? "bg-red-400" :
              ev.type === "question" ? "bg-primary" :
              ev.type === "answer" ? "bg-blue-400" : "bg-muted-foreground",
            )} />
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {formatMs(ev.at_ms)}
            </p>
            <p className="text-xs font-medium text-foreground">{ev.label}</p>
            {ev.detail && (
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{ev.detail}</p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildSessionEvents(
  session: Record<string, unknown> | null,
  answers: AnswerRow[],
  transcriptRows: Array<{ content: string; offset_ms?: number | null; speaker?: string }>,
): SessionEvent[] {
  const events: SessionEvent[] = [];
  let offset = 0;

  if (session?.started_at || session?.created_at) {
    events.push({
      id: "start",
      label: "Session started",
      type: "start",
      at_ms: 0,
    });
  }

  answers.forEach((a, i) => {
    events.push({
      id: `q-${a.id}`,
      label: `Question ${i + 1}`,
      detail: a.question,
      type: "question",
      at_ms: offset,
    });
    offset += 60_000;
    if (a.answer) {
      events.push({
        id: `a-${a.id}`,
        label: `Answer ${i + 1}`,
        detail: a.answer.slice(0, 120) + (a.answer.length > 120 ? "…" : ""),
        type: "answer",
        at_ms: offset,
      });
      offset += 90_000;
    }
  });

  transcriptRows.forEach((row, i) => {
    events.push({
      id: `tx-${i}`,
      label: row.speaker ? `${row.speaker} spoke` : "Transcript segment",
      detail: row.content.slice(0, 100),
      type: "transcript",
      at_ms: row.offset_ms ?? offset + i * 15_000,
    });
  });

  if (session?.ended_at) {
    events.push({
      id: "end",
      label: "Session ended",
      type: "end",
      at_ms: offset + 30_000,
    });
  }

  return events;
}

// ── Missed keywords report ────────────────────────────────────────

export function DebriefMissedKeywords({
  report,
  transcript,
}: {
  report: DetailedReport | null | undefined;
  transcript: string | null;
}) {
  const coverage = useMemo(
    () => buildKeywordCoverage(report, transcript),
    [report, transcript],
  );

  if (!coverage.length && !(report?.missed_keywords?.length)) return null;

  const overallPct = coverage.length
    ? Math.round(coverage.reduce((s, k) => s + k.coverage_pct, 0) / coverage.length)
    : 0;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tags className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Keyword coverage</h3>
        </div>
        <Badge variant={overallPct >= 70 ? "emerald" : "amber"} size="sm">
          {overallPct}% overall
        </Badge>
      </div>

      <div className="space-y-3 mb-4">
        {coverage.map((kw) => (
          <div key={kw.keyword} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {kw.covered ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                <span className="text-xs font-medium text-foreground">{kw.keyword}</span>
              </div>
              <span className={cn(
                "text-xs font-bold tabular-nums",
                kw.covered ? "text-emerald-400" : "text-red-400",
              )}>
                {kw.coverage_pct}%
              </span>
            </div>
            <ProgressBar
              value={kw.coverage_pct}
              max={100}
              color={kw.covered ? "emerald" : "red"}
              size="xs"
            />
            {!kw.covered && kw.suggestion && (
              <p className="text-[10px] text-muted-foreground mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                {kw.suggestion}
              </p>
            )}
          </div>
        ))}
      </div>

      {transcript && coverage.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Transcript highlights
          </p>
          <div className="max-h-40 overflow-y-auto rounded-xl bg-secondary/50 border border-border p-3">
            <p className="text-xs leading-relaxed whitespace-pre-wrap">
              {highlightTranscript(transcript, coverage)}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            <span className="text-emerald-400">Green</span> = used ·{" "}
            <span className="text-red-400">Red</span> = missed
          </p>
        </div>
      )}
    </Card>
  );
}

// ── Vocal analytics charts ────────────────────────────────────────

function ChartTooltip({
  visible, x, y, children,
}: { visible: boolean; x: number; y: number; children: React.ReactNode }) {
  if (!visible) return null;
  return (
    <div
      className="absolute z-20 pointer-events-none bg-popover border border-border rounded-lg px-2 py-1 text-[10px] text-foreground shadow-xl whitespace-nowrap"
      style={{ left: x, top: y - 28 }}
    >
      {children}
    </div>
  );
}

export function DebriefVocalCharts({ report }: { report: DetailedReport | null | undefined }) {
  const wpm = report?.wpm_series ?? [];
  const fillers = report?.filler_series ?? [];
  const pauses = report?.pause_series ?? [];
  const confidence = report?.confidence_series ?? [];

  const [hover, setHover] = useState<{ chart: string; i: number; x: number; y: number } | null>(null);

  if (!wpm.length && !fillers.length && !pauses.length && !confidence.length) return null;

  const renderLineChart = (
    chartId: string,
    series: { t: number; v: number }[],
    color: string,
    benchmark?: number,
    formatVal?: (v: number, t: number) => string,
  ) => {
    if (series.length < 2) return null;
    const w = 320;
    const h = 80;
    const maxV = Math.max(...series.map((p) => p.v), benchmark ?? 0, 1);
    const minV = Math.min(...series.map((p) => p.v), benchmark ?? maxV);
    const range = Math.max(1, maxV - minV);

    const pts = series.map((p, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((p.v - minV) / range) * h;
      return { x, y, ...p, i };
    });

    const d = `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;
    const benchY = benchmark != null ? h - ((benchmark - minV) / range) * h : null;

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
          {benchY != null && (
            <line
              x1={0} y1={benchY} x2={w} y2={benchY}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.5}
            />
          )}
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {pts.map((p) => (
            <circle
              key={p.i}
              cx={p.x}
              cy={p.y}
              r={4}
              fill={color}
              className="cursor-pointer opacity-0 hover:opacity-100"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (!rect) return;
                setHover({
                  chart: chartId,
                  i: p.i,
                  x: ((p.x / w) * rect.width),
                  y: ((p.y / h) * rect.height),
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        {hover?.chart === chartId && (
          <ChartTooltip visible x={hover.x} y={hover.y}>
            {formatVal?.(series[hover.i].v, series[hover.i].t) ??
              `${Math.round(series[hover.i].v)} @ ${formatMs(series[hover.i].t * 1000)}`}
          </ChartTooltip>
        )}
        {benchmark != null && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Dashed line = industry avg ({benchmark})
          </p>
        )}
      </div>
    );
  };

  const wpmSeries = wpm.map((p) => ({ t: p.t, v: p.wpm }));
  const fillerSeries = fillers.map((p) => ({ t: p.t, v: p.count }));
  const confSeries = confidence.map((p) => ({ t: p.t, v: p.score }));

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-foreground">Vocal analytics</h3>
      </div>
      <div className="space-y-6">
        {wpmSeries.length > 1 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">WPM over session</p>
            {renderLineChart(
              "wpm",
              wpmSeries,
              "hsl(var(--primary))",
              WPM_BENCHMARK,
              (v, t) => `${Math.round(v)} WPM @ ${formatMs(t * 1000)}`,
            )}
          </div>
        )}
        {fillerSeries.length > 1 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Filler word frequency</p>
            {renderLineChart(
              "filler",
              fillerSeries,
              "#f59e0b",
              undefined,
              (v, t) => `${v} fillers @ ${formatMs(t * 1000)}`,
            )}
          </div>
        )}
        {pauses.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Pause distribution</p>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pauses} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`${value} pauses`, "Count"]}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {confSeries.length > 1 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Confidence trend</p>
            {renderLineChart(
              "conf",
              confSeries,
              "#10b981",
              70,
              (v, t) => `${Math.round(v)}% confidence @ ${formatMs(t * 1000)}`,
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Confidence breakdown ──────────────────────────────────────────

export function DebriefConfidenceBreakdown({
  scorecard,
  session,
}: {
  scorecard: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
}) {
  const scores: Record<string, number> = {
    communication: (scorecard?.communication as number) ?? (session?.clarity_score as number) ?? 0,
    confidence: (scorecard?.confidence as number) ?? (session?.confidence_score as number) ?? 0,
    technical: (scorecard?.technical as number) ?? 0,
    problem_solving: (scorecard?.problem_solving as number) ?? 0,
  };

  const hasAny = Object.values(scores).some((v) => v > 0);
  if (!hasAny) return null;

  const avg = Math.round(
    CONFIDENCE_DIMS.reduce((s, d) => s + (scores[d.key] ?? 0), 0) / CONFIDENCE_DIMS.length,
  );

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Confidence breakdown</h3>
        </div>
        <Tooltip
          content="Weighted from clarity, pace, filler rate, and answer structure."
          className="whitespace-normal max-w-[220px]"
        >
          <button type="button" className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
      <p className="text-[10px] text-muted-foreground mb-4">
        Composite confidence score: <span className="font-semibold text-foreground">{avg}/100</span>
        — hover each dimension for details.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {CONFIDENCE_DIMS.map((dim) => {
          const val = scores[dim.key] ?? 0;
          const c = val >= 75 ? "emerald" : val >= 55 ? "amber" : "red";
          return (
            <Tooltip
              key={dim.key}
              content={
                <span className="whitespace-normal block max-w-[200px]">
                  <strong>{dim.label}:</strong> {dim.description}
                  {val < 65 && (
                    <> Tip: drill {dim.label.toLowerCase()} questions in Prep Lab.</>
                  )}
                </span>
              }
              className="whitespace-normal"
            >
              <div className="rounded-lg border border-border p-3 cursor-help hover:bg-secondary/40 transition-colors">
                <p className="text-[10px] text-muted-foreground">{dim.label}</p>
                <p className={cn(
                  "text-xl font-black tabular-nums",
                  c === "emerald" ? "text-emerald-400" :
                  c === "amber" ? "text-amber-400" : "text-red-400",
                )}>
                  {val || "—"}
                </p>
                <ProgressBar value={val} max={100} color={c} size="xs" className="mt-2" />
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* Simple radar-style polygon */}
      <div className="flex justify-center">
        <svg viewBox="0 0 120 120" className="w-32 h-32">
          {[25, 50, 75, 100].map((r) => (
            <polygon
              key={r}
              points={radarPoints(4, (r / 100) * 50, 60, 60)}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
            />
          ))}
          <polygon
            points={radarPoints(
              4,
              CONFIDENCE_DIMS.map((d) => (scores[d.key] ?? 0) / 100 * 50),
              60,
              60,
            )}
            fill="hsl(var(--primary) / 0.2)"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
          />
        </svg>
      </div>
    </Card>
  );
}

function radarPoints(
  count: number,
  radius: number | number[],
  cx: number,
  cy: number,
): string {
  const radii = Array.isArray(radius) ? radius : Array(count).fill(radius);
  return radii
    .map((r, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    })
    .join(" ");
}

// ── Share link ────────────────────────────────────────────────────

function excerptText(text: string | null | undefined, maxLen = 220): string {
  if (!text?.trim()) return "No summary available for this session.";
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trimEnd()}…`;
}

export function DebriefShareButton({
  debriefId,
  report,
  onShareToken,
  previewTitle,
  previewScore,
  previewSummary,
}: {
  debriefId: string;
  report: DetailedReport | null | undefined;
  onShareToken: (token: string) => Promise<void>;
  previewTitle?: string;
  previewScore?: string | number | null;
  previewSummary?: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  async function confirmShare() {
    setCopying(true);
    try {
      let token = report?.share_token;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        await onShareToken(token);
      }
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard");
      setPreviewOpen(false);
    } catch {
      toast.error("Failed to generate share link");
    } finally {
      setCopying(false);
    }
  }

  const scoreLabel =
    previewScore != null && previewScore !== ""
      ? String(previewScore)
      : "—";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPreviewOpen(true)}
        disabled={copying}
        leftIcon={<Share2 className="w-3.5 h-3.5" />}
      >
        {report?.is_shared ? "Copy share link" : "Share session"}
      </Button>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Share debrief preview"
        size="md"
      >
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-border bg-secondary/50 p-4 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Title
              </p>
              <p className="text-sm font-semibold text-foreground mt-1">
                {previewTitle ?? "Session Debrief"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Overall score
              </p>
              <p className="text-lg font-bold text-primary mt-1">{scoreLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Summary excerpt
              </p>
              <p className="text-sm text-foreground leading-relaxed mt-1">
                {excerptText(previewSummary)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-2">
              What recipients will see
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A read-only page with your session grade, summary, strengths, improvements,
              and action plan — not your full private transcript unless you choose to include it later.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => setPreviewOpen(false)}
              disabled={copying}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              loading={copying}
              onClick={() => void confirmShare()}
            >
              Confirm Share
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
