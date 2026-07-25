import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useState, useMemo, useEffect } from "react";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Code2, Search, ChevronRight, Lightbulb, BookOpen,
  Copy, Sparkles, AlertCircle, LayoutList, BarChart3, Type,
  GitBranch, Network, Sigma, Link2, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CodeScratchpad } from "@/components/prep/CodeScratchpad";
import { CodeHighlight, renderTextWithCodeBlocks } from "@/components/prep/CodeHighlight";
import { supabase } from "@/lib/supabase/client";
import type { LucideIcon } from "lucide-react";

const CATEGORIES: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: "all",       label: "All",           icon: LayoutList },
  { id: "arrays",    label: "Arrays",        icon: BarChart3 },
  { id: "strings",   label: "Strings",       icon: Type },
  { id: "trees",     label: "Trees",         icon: GitBranch },
  { id: "graphs",    label: "Graphs",        icon: Network },
  { id: "dp",        label: "Dynamic Prog.", icon: Sigma },
  { id: "linked",    label: "Linked Lists",  icon: Link2 },
  { id: "sorting",   label: "Sorting",       icon: ArrowUpDown },
];

type Difficulty = "easy" | "medium" | "hard";

interface CodingProblem {
  id: string;
  title: string;
  category: string;
  difficulty: Difficulty;
  description: string;
  examples: string;
  tags: string[];
}

interface CodingRow {
  slug: string;
  title: string;
  pattern: string | null;
  description: string | null;
  difficulty: string | null;
  example_problems: Array<{ example?: string }> | null;
  tags: string[] | null;
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy:   "emerald",
  medium: "amber",
  hard:   "red",
};

function normalizeDifficulty(value: string | null | undefined): Difficulty {
  const v = (value ?? "medium").toLowerCase();
  if (v === "easy" || v === "medium" || v === "hard") return v;
  return "medium";
}

export default function CodingHints() {
  const credits = useCredits();

  const [problems, setProblems]     = useState<CodingProblem[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [category, setCategory]     = useState("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<string | null>(null);
  const [hintText, setHintText]     = useState("");
  const [solutionText, setSolutionText] = useState("");
  const [loading, setLoading]       = useState<"hint" | "solution" | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [depth, setDepth]           = useState<"surface" | "medium" | "near-complete">("surface");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: dbError } = await (supabase as any)
        .from("coding_hints")
        .select("slug, title, pattern, description, difficulty, example_problems, tags")
        .eq("published", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (dbError) {
        setFetchError("Couldn't load problems. Please try again later.");
        setProblems([]);
        return;
      }

      const mapped: CodingProblem[] = ((data as CodingRow[]) ?? []).map((row) => ({
        id: row.slug,
        title: row.title,
        category: row.pattern ?? "all",
        difficulty: normalizeDifficulty(row.difficulty),
        description: row.description ?? "",
        examples: Array.isArray(row.example_problems)
          ? row.example_problems.map((e) => e?.example ?? "").filter(Boolean).join("\n\n")
          : "",
        tags: row.tags ?? [],
      }));
      setProblems(mapped);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!problems) return [];
    return problems.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (difficulty !== "all" && p.difficulty !== difficulty) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q));
      }
      return true;
    });
  }, [problems, category, difficulty, search]);

  const activeProblem = problems?.find((p) => p.id === selected) ?? null;

  async function getAIHint() {
    if (!activeProblem || !credits.canAfford("coding_hint")) return;
    setLoading("hint");
    setError(null);
    setHintText("");

    try {
      const input = `Problem: ${activeProblem.title}\n\n${activeProblem.description}\n\nExamples:\n${activeProblem.examples}\n\nTags: ${activeProblem.tags.join(", ")}`;
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "coding_hint",
        input,
        depth,
      });
      setHintText(
        data.result ??
          "Think about the data structures that would help here. Consider time and space complexity tradeoffs."
      );
      await refreshCredits();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI hints unavailable. Please try again.";
      setError(message);
      setHintText("");
      toast.error(message);
    }
    setLoading(null);
  }

  async function getAISolution() {
    if (!activeProblem || !credits.canAfford("coding_solution")) return;
    setLoading("solution");
    setError(null);
    setSolutionText("");

    try {
      const input = `Problem: ${activeProblem.title}\n\n${activeProblem.description}\n\nExamples:\n${activeProblem.examples}\n\nTags: ${activeProblem.tags.join(", ")}`;
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "coding_solution",
        input,
      });
      setSolutionText(data.result ?? "Solution explanation unavailable.");
      await refreshCredits();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI solution unavailable. Please try again.";
      setError(message);
      setSolutionText("");
      toast.error(message);
    }
    setLoading(null);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Coding Problems"
        description="Browse interview coding problems, get AI hints and solution explanations"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Prep Lab", href: "/app/prep" },
          { label: "Coding Hints" },
        ]}
      />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="w-full lg:w-80 lg:max-w-full space-y-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems…"
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all",
                  category === c.id
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <c.icon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" aria-hidden />
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {(["all", "easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all capitalize",
                  difficulty === d
                    ? d === "easy" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                    : d === "medium" ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                    : d === "hard" ? "bg-red-500/20 border-red-500/30 text-red-300"
                    : "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {problems === null && (
              <div className="space-y-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />
                ))}
              </div>
            )}
            {problems !== null && filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelected(p.id); setHintText(""); setSolutionText(""); setError(null); }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === p.id
                    ? "bg-primary/10 border-primary/30"
                    : "bg-secondary/50 border-border hover:bg-secondary"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate pr-2">{p.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    variant={DIFFICULTY_COLORS[p.difficulty] as "emerald" | "amber" | "red"}
                    size="sm"
                  >
                    {p.difficulty}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{CATEGORIES.find((c) => c.id === p.category)?.label ?? p.category}</span>
                </div>
              </button>
            ))}
            {problems !== null && filtered.length === 0 && (
              <div className="text-center py-8">
                <Code2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {fetchError ?? "No problems match your filters."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {activeProblem ? (
            <>
              <Card>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{activeProblem.title}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant={DIFFICULTY_COLORS[activeProblem.difficulty] as "emerald" | "amber" | "red"} size="sm">
                        {activeProblem.difficulty}
                      </Badge>
                      {activeProblem.tags.map((t) => (
                        <Badge key={t} variant="default" size="sm">{t}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{activeProblem.description}</p>
                {activeProblem.examples && (
                  <CodeHighlight
                    language="python"
                    code={activeProblem.examples}
                    className="mt-4"
                  />
                )}
              </Card>

              {error && (
                <Card className="border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                </Card>
              )}

              <div className="flex gap-1.5">
                {([
                  { id: "surface",      label: "Quick hint" },
                  { id: "medium",       label: "Deeper hint" },
                  { id: "near-complete", label: "Near-complete" },
                ] as const).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setDepth(d.id); setHintText(""); }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                      depth === d.id
                        ? "bg-primary/20 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={getAIHint}
                  disabled={loading === "hint" || !credits.canAfford("coding_hint")}
                  loading={loading === "hint"}
                  leftIcon={<Lightbulb className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Get hint ({credits.costs.coding_hint} credit)
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={getAISolution}
                  disabled={loading === "solution" || !credits.canAfford("coding_solution")}
                  loading={loading === "solution"}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Explain solution ({credits.costs.coding_solution} credits)
                </Button>
              </div>

              {hintText && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" /> Hint
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(hintText); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{hintText}</p>
                </Card>
              )}

              {solutionText && (
                <Card className="border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> Solution Explanation
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(solutionText); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">{renderTextWithCodeBlocks(solutionText)}</div>
                </Card>
              )}

              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Your solution
                </p>
                <CodeScratchpad />
              </div>
            </>
          ) : (
            <Card className="text-center py-20">
              <Code2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Select a problem to view details</p>
              <p className="text-muted-foreground text-xs mt-1">Get AI-powered hints and solution explanations</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
