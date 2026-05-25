// @ts-nocheck
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Copy, Save, CheckCircle, Sparkles,
  AlertCircle, ArrowRight, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Alternatives {
  formal:    string;
  confident: string;
  concise:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rephraser — generates 3 style alternatives in one click
// ─────────────────────────────────────────────────────────────────────────────

export default function Rephraser() {
  const credits = useCredits();
  const { user } = useAuthStore();

  const [original,     setOriginal]     = useState("");
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [saved,        setSaved]        = useState<keyof Alternatives | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const wordCount = original.trim().split(/\s+/).filter(Boolean).length;

  // ── Generate 3 alternatives ──────────────────────────────────────────────

  async function handleRephrase() {
    if (!original.trim() || !credits.canAfford("rephrase")) return;
    setLoading(true);
    setError(null);
    setAlternatives(null);
    setSaved(null);

    try {
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "rephrase",
        input: original,
      });
      const raw = data.result ?? "";
      const parsed: Alternatives = JSON.parse(raw);
      setAlternatives(parsed);
      await refreshCredits();
    } catch (err) {
      setAlternatives(getOfflineAlternatives(original));
      toast.info("Using offline rephrasing — AI unavailable.");
    }
    setLoading(false);
  }

  // ── Save a specific alternative to Answer Bank ───────────────────────────

  async function saveToBank(style: keyof Alternatives) {
    if (!user || !alternatives) return;
    const text = alternatives[style];
    const styleLabels: Record<keyof Alternatives, string> = {
      formal:    "Formal",
      confident: "Confident",
      concise:   "Concise",
    };
    const { error: insertErr } = await supabase.from("answer_bank").insert({
      user_id:       user.id,
      question_text: `Rephrased answer (${styleLabels[style]})`,
      answer_text:   text,
      source:        "prep_lab",
    });
    if (insertErr) {
      toast.error("Failed to save — please try again");
      return;
    }
    setSaved(style);
    toast.success(`${styleLabels[style]} version saved to Answer Bank`);
    setTimeout(() => setSaved(null), 2500);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Answer Rephraser"
        description="Paste an interview answer and get three AI-improved alternatives — formal, confident, and concise"
      />

      {/* Input */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-widest">Original answer</p>
          <span className="text-[10px] text-muted-foreground">{wordCount} words</span>
        </div>
        <textarea
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          placeholder={`Paste your interview answer here…\n\nExample: 'In my previous role, I was basically responsible for kind of leading the migration to microservices. We sort of had some issues with the monolith and I think I helped make things better.'`}
          rows={8}
          className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
        />
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        </Card>
      )}

      {/* Generate button */}
      <Button
        variant="primary"
        size="md"
        onClick={handleRephrase}
        disabled={!original.trim() || wordCount < 5 || loading || !credits.canAfford("rephrase")}
        loading={loading}
        leftIcon={<Sparkles className="w-4 h-4" />}
        fullWidth
      >
        Generate 3 alternatives ({credits.costs.rephrase} credits)
      </Button>

      {/* 3 result cards */}
      {alternatives && (
        <div className="space-y-3">
          {(["formal", "confident", "concise"] as const).map((style) => {
            const styleConfig = {
              formal:    { label: "Formal",    icon: "📋", color: "blue"   },
              confident: { label: "Confident", icon: "💪", color: "violet" },
              concise:   { label: "Concise",   icon: "✂️",  color: "emerald" },
            }[style];

            const borderClass = {
              blue:    "border-blue-500/20 bg-blue-500/5",
              violet:  "border-violet-500/20 bg-violet-500/5",
              emerald: "border-emerald-500/20 bg-emerald-500/5",
            }[styleConfig.color];

            const headerClass = {
              blue:    "text-blue-400",
              violet:  "text-violet-400",
              emerald: "text-emerald-400",
            }[styleConfig.color];

            const wordCt = alternatives[style].trim().split(/\s+/).filter(Boolean).length;

            return (
              <Card key={style} className={borderClass}>
                <div className="flex items-center justify-between mb-2">
                  <p className={cn("text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5", headerClass)}>
                    <span>{styleConfig.icon}</span>
                    {styleConfig.label}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground">{wordCt} words</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(alternatives[style]); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => saveToBank(style)}
                      className={cn(
                        "flex items-center gap-1 text-xs transition-colors",
                        saved === style ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {saved === style
                        ? <CheckCircle className="w-3.5 h-3.5" />
                        : <Save className="w-3.5 h-3.5" />
                      }
                      {saved === style ? "Saved!" : "Save"}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {alternatives[style]}
                </p>
              </Card>
            );
          })}

          {/* Word count comparison */}
          <Card>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">Changes summary</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{wordCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Original words</p>
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">
                  {Math.round((
                    alternatives.formal.trim().split(/\s+/).filter(Boolean).length +
                    alternatives.confident.trim().split(/\s+/).filter(Boolean).length +
                    alternatives.concise.trim().split(/\s+/).filter(Boolean).length
                  ) / 3)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Avg improved words</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!alternatives && !loading && (
        <Card className="text-center py-12">
          <Wand2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Your three improved versions will appear here</p>
          <p className="text-xs text-muted-foreground mt-1">Formal · Confident · Concise</p>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline fallback — returns 3 alternatives as object
// ─────────────────────────────────────────────────────────────────────────────

function getOfflineAlternatives(original: string): Alternatives {
  const preview = original.substring(0, 120) + (original.length > 120 ? "…" : "");
  return {
    formal:    `[Offline — Formal]\n\nPlease note that the AI service is temporarily unavailable. Your original answer has been preserved below for reference:\n\n"${preview}"`,
    confident: `[Offline — Confident]\n\nThe AI rephrasing service is currently offline. When it returns, this version will remove hedging language and use stronger action verbs.\n\n"${preview}"`,
    concise:   `[Offline — Concise]\n\nThe AI service is offline. When available, this version will trim filler words and reduce word count by 20–30%.\n\n"${preview}"`,
  };
}
