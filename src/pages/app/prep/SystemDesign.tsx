import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { supabase } from "@/integrations/supabase/client";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useState, useEffect } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Server, ChevronRight, Sparkles, Copy, Save, CheckCircle,
  AlertCircle, Network, Database, Globe, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { answerBankDB } from "@/lib/supabase/database";
import { Whiteboard } from "@/components/prep/Whiteboard";

type Difficulty = "easy" | "medium" | "hard";

interface DesignTopic {
  id: string;
  title: string;
  category: string;
  difficulty: Difficulty;
  prompt: string;
  keyAreas: string[];
}

interface DesignRow {
  slug: string;
  title: string;
  category: string | null;
  difficulty: string | null;
  description: string | null;
  key_concepts: string[] | null;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Web: <Globe className="w-3.5 h-3.5" />,
  "Real-time": <Network className="w-3.5 h-3.5" />,
  Social: <Server className="w-3.5 h-3.5" />,
  Infra: <Shield className="w-3.5 h-3.5" />,
  Storage: <Database className="w-3.5 h-3.5" />,
  Search: <Globe className="w-3.5 h-3.5" />,
  Media: <Server className="w-3.5 h-3.5" />,
};

function normalizeDifficulty(value: string | null | undefined): Difficulty {
  const v = (value ?? "medium").toLowerCase();
  if (v === "easy" || v === "medium" || v === "hard") return v;
  return "medium";
}

export default function SystemDesign() {
  const credits = useCredits();
  const { user } = useAuthStore();

  const [topics, setTopics]       = useState<DesignTopic[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected]   = useState<string | null>(null);
  const [notes, setNotes]         = useState("");
  const [breakdown, setBreakdown] = useState("");
  const [loading, setLoading]     = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: dbError } = await (supabase as any)
        .from("system_design_topics")
        .select("slug, title, category, difficulty, description, key_concepts")
        .eq("published", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (dbError) {
        setFetchError("Couldn't load topics. Please try again later.");
        setTopics([]);
        return;
      }

      const mapped: DesignTopic[] = ((data as DesignRow[]) ?? []).map((row) => ({
        id: row.slug,
        title: row.title,
        category: row.category ?? "Web",
        difficulty: normalizeDifficulty(row.difficulty),
        prompt: row.description ?? "",
        keyAreas: row.key_concepts ?? [],
      }));
      setTopics(mapped);
    })();
    return () => { cancelled = true; };
  }, []);

  const activeTopic = topics?.find((t) => t.id === selected) ?? null;

  async function getAIBreakdown() {
    if (!activeTopic || !credits.canAfford("system_design")) return;
    setLoading(true);
    setError(null);
    setBreakdown("");

    try {
      const input = `Topic: ${activeTopic.title}\n\nPrompt: ${activeTopic.prompt}\n\nKey areas: ${activeTopic.keyAreas.join(", ")}${notes ? `\n\nCandidate notes:\n${notes}` : ""}`;
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "system_design",
        input,
      });
      setBreakdown(data.result ?? "Breakdown unavailable.");
      await refreshCredits();
    } catch (err) {
      setBreakdown(getOfflineBreakdown(activeTopic));
      toast.info("Using offline breakdown — AI unavailable.");
    }
    setLoading(false);
  }

  async function saveDesignNotes() {
    if (!user || !activeTopic || !notes.trim()) return;
    try {
      await answerBankDB.create(user.id, {
        question_text: `System Design: ${activeTopic.title}`,
        answer_text: `${notes}\n\n--- AI Breakdown ---\n${breakdown}`,
        category: "System Design",
        source: "prep_lab",
      });
    } catch {
      toast.error("Failed to save — please try again");
      return;
    }
    setSaved(true);
    toast.success("Design notes saved to Answer Bank");
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="System Design"
        description="Practice system design interviews with AI-guided breakdowns"
      />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="w-full lg:w-80 lg:max-w-full space-y-2 flex-shrink-0 max-h-[600px] overflow-y-auto pr-1">
          {topics === null && (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />
              ))}
            </div>
          )}
          {topics !== null && topics.length === 0 && (
            <div className="text-center py-8">
              <Server className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {fetchError ?? "No topics available yet."}
              </p>
            </div>
          )}
          {topics?.map((topic) => (
            <button
              key={topic.id}
              onClick={() => { setSelected(topic.id); setBreakdown(""); setNotes(""); setError(null); setSaved(false); }}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl border transition-all",
                selected === topic.id
                  ? "bg-violet-600/10 border-violet-500/30"
                  : "bg-secondary/50 border-border hover:bg-secondary"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{CATEGORY_ICONS[topic.category] ?? <Server className="w-3.5 h-3.5" />}</span>
                  <span className="text-sm font-medium text-foreground">{topic.title}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 mt-1.5 ml-6">
                <Badge variant="default" size="sm">{topic.category}</Badge>
                <Badge variant={topic.difficulty === "easy" ? "emerald" : topic.difficulty === "medium" ? "amber" : "red"} size="sm">
                  {topic.difficulty}
                </Badge>
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4">
          {activeTopic ? (
            <>
              <Card>
                <h2 className="text-lg font-semibold text-foreground mb-2">{activeTopic.title}</h2>
                <p className="text-sm text-foreground leading-relaxed mb-4">{activeTopic.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  {activeTopic.keyAreas.map((area) => (
                    <Badge key={area} variant="default" size="sm">{area}</Badge>
                  ))}
                </div>
              </Card>

              <Card>
                <p className="text-xs font-medium text-foreground mb-2">Your design notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sketch your approach here — components, data flow, scaling strategy…"
                  rows={5}
                  className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </Card>

              {error && (
                <Card className="border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                </Card>
              )}

              <div className="flex gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={getAIBreakdown}
                  disabled={loading || !credits.canAfford("system_design")}
                  loading={loading}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Get AI breakdown ({credits.costs.system_design} credits)
                </Button>
                {(notes.trim() || breakdown) && (
                  <Button
                    variant={saved ? "success" : "secondary"}
                    size="sm"
                    onClick={saveDesignNotes}
                    leftIcon={saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  >
                    {saved ? "Saved!" : "Save"}
                  </Button>
                )}
              </div>

              {breakdown && (
                <Card className="border-violet-500/20 bg-violet-500/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Design Breakdown
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(breakdown); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{breakdown}</div>
                </Card>
              )}

              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Sketch your design
                </p>
                <Whiteboard height={380} />
              </div>
            </>
          ) : (
            <Card className="text-center py-20">
              <Server className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Select a system design topic</p>
              <p className="text-muted-foreground text-xs mt-1">Get AI-powered component breakdowns and scaling strategies</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function getOfflineBreakdown(topic: DesignTopic): string {
  return `## ${topic.title} — Design Breakdown (Offline)\n\n### 1. Requirements\n- Functional: Core features implied by the prompt\n- Non-functional: Scalability, availability, latency, consistency\n- Capacity estimation: Estimate reads/writes per second, storage needs\n\n### 2. High-Level Architecture\nKey components to consider: ${topic.keyAreas.join(", ")}\n\n### 3. Component Deep-Dive\nFor each component, discuss:\n- What technology/service would you use?\n- How does data flow between components?\n- What are the scaling strategies?\n\n### 4. Data Model\n- What tables/collections do you need?\n- What are the access patterns?\n- SQL vs NoSQL tradeoffs for this use case\n\n### 5. Scaling & Tradeoffs\n- Horizontal vs vertical scaling\n- Caching strategies (CDN, application cache, database cache)\n- CAP theorem tradeoffs for this system\n- What would you sacrifice and why?\n\n### 6. Monitoring & Reliability\n- Key metrics to monitor\n- Failure scenarios and mitigation\n- Data backup and recovery strategy`;
}
