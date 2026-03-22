// @ts-nocheck
import { useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Copy, Save, CheckCircle, Sparkles,
  AlertCircle, ArrowRight, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

const REPHRASE_STYLES = [
  { id: "concise",    label: "More Concise",    desc: "Trim filler words, get to the point faster",       icon: "✂️" },
  { id: "star",       label: "STAR Format",     desc: "Restructure using Situation-Task-Action-Result",    icon: "⭐" },
  { id: "confident",  label: "More Confident",  desc: "Stronger language, remove hedging and qualifiers",  icon: "💪" },
  { id: "technical",  label: "More Technical",  desc: "Add technical depth and specifics",                 icon: "🔧" },
  { id: "executive",  label: "Executive Style",  desc: "Strategic, metrics-focused, leadership language",  icon: "📊" },
  { id: "storytelling", label: "Storytelling",   desc: "Make it more engaging with narrative flow",         icon: "📖" },
];

export default function Rephraser() {
  const credits = useCredits();
  const { user } = useAuthStore();

  const [original, setOriginal]     = useState("");
  const [style, setStyle]           = useState("concise");
  const [rephrased, setRephrased]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const wordCount = original.trim().split(/\s+/).filter(Boolean).length;
  const rephrasedWordCount = rephrased.trim().split(/\s+/).filter(Boolean).length;

  async function handleRephrase() {
    if (!original.trim() || !credits.canAfford("rephrase")) return;
    setLoading(true);
    setError(null);
    setRephrased("");
    setSaved(false);

    const { success, error: deductErr } = await credits.deduct("rephrase");
    if (!success) {
      setError(deductErr ?? "Failed to deduct credits");
      setLoading(false);
      return;
    }

    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const styleLabel = REPHRASE_STYLES.find((s) => s.id === style)?.label ?? style;
      const input = `Style: ${styleLabel}\n\nOriginal answer:\n${original}`;
      const res = await fetch(`${EDGE_BASE}/prep-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          tool_id: "rephrase",
          input,
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setRephrased(data.result ?? "Rephrasing unavailable.");
    } catch (err) {
      await credits.refund("rephrase");
      setRephrased(getOfflineRephrase(original, style));
      toast.info("Using offline rephrasing — AI unavailable. Credit refunded.");
    }
    setLoading(false);
  }

  async function saveToBank() {
    if (!user || !rephrased) return;
    const { error: insertErr } = await supabase.from("answer_bank").insert({
      user_id: user.id,
      question_text: `Rephrased answer (${REPHRASE_STYLES.find((s) => s.id === style)?.label})`,
      answer_text: rephrased,
      source: "prep_lab",
    });
    if (insertErr) {
      toast.error("Failed to save — please try again");
      return;
    }
    setSaved(true);
    toast.success("Saved to Answer Bank");
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Answer Rephraser"
        description="Paste an interview answer, choose a style, and get an AI-improved version"
      />

      <div className="flex flex-wrap gap-2">
        {REPHRASE_STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={cn(
              "px-4 py-2.5 rounded-xl border text-left transition-all",
              style === s.id
                ? "bg-violet-600/15 border-violet-500/30"
                : "bg-white/[0.02] border-white/8 hover:bg-accent/5 hover:border-white/15"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{s.icon}</span>
              <span className={cn("text-sm font-medium", style === s.id ? "text-violet-300" : "text-foreground")}>{s.label}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 ml-7">{s.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest">Original</p>
            <span className="text-[10px] text-muted-foreground">{wordCount} words</span>
          </div>
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            placeholder="Paste your interview answer here…

Example: 'In my previous role, I was basically responsible for kind of leading the migration to microservices. We sort of had some issues with the monolith and I think I helped make things better.'"
            rows={10}
            className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-violet-500"
          />
        </Card>

        <Card className={cn(rephrased && "border-emerald-500/20 bg-emerald-500/5")}>
          <div className="flex items-center justify-between mb-2">
            <p className={cn(
              "text-xs font-semibold uppercase tracking-widest",
              rephrased ? "text-emerald-400" : "text-foreground"
            )}>
              Improved
            </p>
            {rephrased && <span className="text-[10px] text-muted-foreground">{rephrasedWordCount} words</span>}
          </div>
          {rephrased ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap min-h-[200px]">
                {rephrased}
              </p>
              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => { navigator.clipboard.writeText(rephrased); toast.success("Copied!"); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
                <button
                  onClick={saveToBank}
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-colors",
                    saved ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {saved ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                  {saved ? "Saved!" : "Save to bank"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
              <div className="text-center">
                <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Your improved answer will appear here</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        </Card>
      )}

      <Button
        variant="primary"
        size="md"
        onClick={handleRephrase}
        disabled={!original.trim() || wordCount < 5 || loading || !credits.canAfford("rephrase")}
        loading={loading}
        leftIcon={<Sparkles className="w-4 h-4" />}
        fullWidth
      >
        Rephrase answer ({credits.costs.rephrase} credit)
      </Button>

      {rephrased && original && (
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
              <p className="text-2xl font-bold text-emerald-400">{rephrasedWordCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Improved words</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function getOfflineRephrase(original: string, style: string): string {
  const styleLabel = REPHRASE_STYLES.find((s) => s.id === style)?.label ?? style;
  return `[Offline ${styleLabel} rephrase]\n\nYour original answer has been noted. When the AI service is available, it will:\n\n${
    style === "concise" ? "• Remove filler words (basically, kind of, sort of)\n• Eliminate redundant phrases\n• Strengthen action verbs\n• Reduce word count by 20-30%" :
    style === "star" ? "• Restructure into clear Situation → Task → Action → Result\n• Ensure each section is distinct\n• Add quantified results where possible" :
    style === "confident" ? "• Replace hedging language (I think, maybe, sort of)\n• Use decisive verbs (led, drove, achieved vs helped, assisted)\n• Add impact statements" :
    style === "technical" ? "• Add specific technologies and methodologies\n• Include architectural decisions and tradeoffs\n• Reference metrics and performance improvements" :
    style === "executive" ? "• Focus on business impact and ROI\n• Use strategic language and metrics\n• Highlight leadership and decision-making" :
    "• Add narrative arc and engagement hooks\n• Create vivid context setting\n• Build tension and resolution"
  }\n\nOriginal answer preserved:\n"${original.substring(0, 200)}${original.length > 200 ? "…" : ""}"`;
}

