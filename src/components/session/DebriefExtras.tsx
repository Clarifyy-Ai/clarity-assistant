// Sprint B: Debrief Completeness — additive widgets
// - WPM mini chart (sparkline)
// - Missed keywords list
// - Editable speaker labels
// - Thumbs up/down rating
import { useEffect, useMemo, useState } from "react";
import { ThumbsUp, ThumbsDown, Activity, Tags, Mic, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type WPMPoint = { t: number; wpm: number };

interface DebriefExtrasProps {
  debriefId: string;
  /** Optional series — if omitted, widget self-loads from detailed_report jsonb */
  wpmSeries?: WPMPoint[];
  missedKeywords?: string[];
  speakers?: { id: string; label: string }[];
  initialRating?: 1 | -1 | null;
}

export function DebriefExtras({
  debriefId,
  wpmSeries: wpmProp,
  missedKeywords: kwProp,
  speakers: speakersProp,
  initialRating = null,
}: DebriefExtrasProps) {
  const [wpmSeries, setWpmSeries] = useState<WPMPoint[]>(wpmProp ?? []);
  const [missedKeywords, setMissedKeywords] = useState<string[]>(kwProp ?? []);
  const [speakers, setSpeakers] = useState(speakersProp ?? []);
  const [rating, setRating] = useState<1 | -1 | null>(initialRating);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Lazy load missing pieces from detailed_report jsonb
  useEffect(() => {
    if (wpmProp && kwProp && speakersProp) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("session_debriefs")
        .select("detailed_report")
        .eq("id", debriefId)
        .maybeSingle();
      const r = data?.detailed_report ?? {};
      if (!wpmProp && Array.isArray(r.wpm_series)) setWpmSeries(r.wpm_series);
      if (!kwProp && Array.isArray(r.missed_keywords)) setMissedKeywords(r.missed_keywords);
      if (!speakersProp && Array.isArray(r.speakers)) setSpeakers(r.speakers);
      if (typeof r.rating === "number") setRating(r.rating === 1 ? 1 : r.rating === -1 ? -1 : null);
    })();
  }, [debriefId]);

  const wpmStats = useMemo(() => {
    if (!wpmSeries.length) return null;
    const vals = wpmSeries.map((p) => p.wpm);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { min, max, avg };
  }, [wpmSeries]);

  async function patchReport(patch: Record<string, any>) {
    setSaving(true);
    try {
      const { data: cur } = await (supabase as any)
        .from("session_debriefs")
        .select("detailed_report")
        .eq("id", debriefId)
        .maybeSingle();
      const next = { ...(cur?.detailed_report ?? {}), ...patch };
      const { error } = await (supabase as any)
        .from("session_debriefs")
        .update({ detailed_report: next })
        .eq("id", debriefId);
      if (error) throw error;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function setSpeakerLabel(id: string, label: string) {
    const next = speakers.map((s) => (s.id === id ? { ...s, label } : s));
    setSpeakers(next);
    setEditingId(null);
    await patchReport({ speakers: next });
    toast.success("Speaker label updated");
  }

  async function rate(value: 1 | -1) {
    const next = rating === value ? null : value;
    setRating(next);
    await patchReport({ rating: next });
    toast.success(next ? "Thanks for the feedback" : "Rating cleared");
  }

  // Sparkline geometry
  const sparkline = useMemo(() => {
    if (wpmSeries.length < 2) return null;
    const w = 280;
    const h = 60;
    const max = Math.max(...wpmSeries.map((p) => p.wpm), 200);
    const min = Math.min(...wpmSeries.map((p) => p.wpm), 60);
    const range = Math.max(1, max - min);
    const pts = wpmSeries.map((p, i) => {
      const x = (i / (wpmSeries.length - 1)) * w;
      const y = h - ((p.wpm - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { d: `M ${pts.join(" L ")}`, w, h };
  }, [wpmSeries]);

  const hasAny =
    wpmSeries.length > 0 || missedKeywords.length > 0 || speakers.length > 0;

  if (!hasAny && rating === null) {
    // Always render rating; widgets only when data exists
  }

  return (
    <div className="space-y-4">
      {/* WPM mini-chart */}
      {wpmSeries.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold">Words per minute</h3>
          </div>
          {sparkline && (
            <svg
              viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
              className="w-full h-16"
              preserveAspectRatio="none"
              aria-label="WPM over time"
            >
              <path
                d={sparkline.d}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          )}
          {wpmStats && (
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Stat label="Min" value={wpmStats.min} />
              <Stat label="Avg" value={wpmStats.avg} />
              <Stat label="Max" value={wpmStats.max} />
            </div>
          )}
        </div>
      )}

      {/* Missed keywords */}
      {missedKeywords.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tags className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Missed keywords</h3>
            <span className="text-xs text-muted-foreground">
              {missedKeywords.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missedKeywords.map((kw) => (
              <span
                key={kw}
                className="px-2 py-0.5 text-xs rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Editable speaker labels */}
      {speakers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Speakers</h3>
          </div>
          <ul className="space-y-2">
            {speakers.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
                  {s.id}
                </span>
                {editingId === s.id ? (
                  <>
                    <input
                      autoFocus
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSpeakerLabel(s.id, draftLabel.trim() || s.label);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => setSpeakerLabel(s.id, draftLabel.trim() || s.label)}
                      disabled={saving}
                      className="p-1 rounded-md hover:bg-secondary"
                      aria-label="Save label"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{s.label}</span>
                    <button
                      onClick={() => {
                        setEditingId(s.id);
                        setDraftLabel(s.label);
                      }}
                      className="p-1 rounded-md hover:bg-secondary"
                      aria-label="Edit label"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Thumbs rating */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Was this debrief helpful?</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rate(1)}
            disabled={saving}
            aria-pressed={rating === 1}
            aria-label="Helpful"
            className={cn(
              "p-2 rounded-lg border transition-colors",
              rating === 1
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-border hover:bg-secondary text-muted-foreground"
            )}
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => rate(-1)}
            disabled={saving}
            aria-pressed={rating === -1}
            aria-label="Not helpful"
            className={cn(
              "p-2 rounded-lg border transition-colors",
              rating === -1
                ? "border-red-500/50 bg-red-500/10 text-red-400"
                : "border-border hover:bg-secondary text-muted-foreground"
            )}
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-secondary py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
