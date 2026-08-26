import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { prepToolContentIdempotencyKey } from "@/lib/network/idempotency";
import { sha256 } from "@/lib/utils/hashUtils";
import {
  getAiUserFacingError,
  isAiProviderUnavailableError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { supabase } from "@/integrations/supabase/client";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useState, useEffect, useMemo, useRef } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Server, ChevronRight, Sparkles, Copy, Save, CheckCircle,
  AlertCircle, Network, Database, Globe, Shield, LayoutTemplate,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PrepToolShell, SaveToAnswerBankConfirm } from "@/components/prep/PrepToolShell";
import { answerBankDB } from "@/lib/supabase/database";
import { Whiteboard, type WhiteboardHandle } from "@/components/prep/Whiteboard";
import { SYSTEM_DESIGN_PRESETS } from "@/lib/prep/systemDesignPresets";
import { splitMarkdownSections } from "@/lib/prep/structuredOutput";
import { validateSystemDesignOutput } from "@/lib/prep/systemDesignOutput";
import {
  diagramSpecToPresetShapes,
  parseSystemDesignResponse,
  type DiagramSpec,
} from "@/lib/prep/systemDesignDiagram";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

type Difficulty = "easy" | "medium" | "hard";

type GenPhase =
  | "IDLE"
  | "VALIDATING"
  | "GENERATING"
  | "VALIDATING_OUTPUT"
  | "COMPLETED"
  | "FAILED";

type SavePhase = "IDLE" | "SAVING" | "SAVED" | "SAVE_FAILED";

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

const AI_UNAVAILABLE = "AI is temporarily unavailable. Please try again.";
const SAVE_FAILED_MSG =
  "We generated the design, but couldn't save it. Please retry.";

function normalizeDifficulty(value: string | null | undefined): Difficulty {
  const v = (value ?? "medium").toLowerCase();
  if (v === "easy" || v === "medium" || v === "hard") return v;
  return "medium";
}

export default function SystemDesign() {
  const credits = useCredits();
  const { user } = useAuthStore();
  const whiteboardRef = useRef<WhiteboardHandle>(null);
  const inflightKeyRef = useRef<string | null>(null);
  const genInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const generationSeqRef = useRef(0);
  const diagramLoadedRef = useRef<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activePreset, setActivePreset] = useState<string | null>(null);
  /** 'auto' follows reduced-motion preference; user can override. */
  const [boardMode, setBoardMode] = useState<"auto" | "notes" | "board">("auto");
  const useNotesOnly =
    boardMode === "notes" || (boardMode === "auto" && prefersReducedMotion);

  const [topics, setTopics]       = useState<DesignTopic[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected]   = useState<string | null>(null);
  const [notes, setNotes]         = useState("");
  const [breakdown, setBreakdown] = useState("");
  const [genPhase, setGenPhase]   = useState<GenPhase>("IDLE");
  const [savePhase, setSavePhase] = useState<SavePhase>("IDLE");
  const [savedAnswerId, setSavedAnswerId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [diagramSpec, setDiagramSpec] = useState<DiagramSpec | null>(null);

  const generating =
    genPhase === "VALIDATING" ||
    genPhase === "GENERATING" ||
    genPhase === "VALIDATING_OUTPUT";
  const saving = savePhase === "SAVING";

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
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      abortRef.current = null;
      genInFlightRef.current = false;
    };
  }, []);

  const activeTopic = topics?.find((t) => t.id === selected) ?? null;
  const breakdownSections = useMemo(
    () => (breakdown ? splitMarkdownSections(breakdown) : []),
    [breakdown],
  );


  useEffect(() => {
    if (genPhase !== "COMPLETED" || !diagramSpec || useNotesOnly) return;
    const key = JSON.stringify(diagramSpec);
    if (diagramLoadedRef.current === key) return;
    whiteboardRef.current?.loadShapes(diagramSpecToPresetShapes(diagramSpec));
    diagramLoadedRef.current = key;
  }, [diagramSpec, genPhase, useNotesOnly]);

  useEffect(() => {
    if (!activeTopic || generating || saving) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await supabase
        .from("answer_bank")
        .select("id, answer_text, created_at")
        .eq("source", "prep_lab")
        .eq("question_text", `System Design: ${activeTopic.title}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || loadError || !data) return;
      const answer = String(data.answer_text ?? "");
      const marker = "\n\n--- AI Breakdown ---\n";
      const markerIndex = answer.indexOf(marker);
      setNotes(markerIndex >= 0 ? answer.slice(0, markerIndex) : "");
      setBreakdown(markerIndex >= 0 ? answer.slice(markerIndex + marker.length) : answer);
      setSavedAnswerId(String(data.id));
      setSavePhase("SAVED");
      setGenPhase("COMPLETED");
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTopic, generating, saving]);

  function buildInput(topic: DesignTopic, candidateNotes: string): string {
    return `Topic: ${topic.title}\n\nPrompt: ${topic.prompt}\n\nKey areas: ${topic.keyAreas.join(", ")}${candidateNotes ? `\n\nCandidate notes:\n${candidateNotes}` : ""}`;
  }

  async function getAIBreakdown() {
    if (!activeTopic || generating || saving) return;
    if (genInFlightRef.current) return;
    if (!credits.canAfford("system_design")) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++generationSeqRef.current;
    genInFlightRef.current = true;
    setGenPhase("VALIDATING");
    setError(null);

    try {
      const input = buildInput(activeTopic, notes);
      const contentHash = await sha256(input);
      if (controller.signal.aborted || seq !== generationSeqRef.current) return;

      const idempotencyKey =
        inflightKeyRef.current ??
        prepToolContentIdempotencyKey("system_design", contentHash);
      inflightKeyRef.current = idempotencyKey;

      setGenPhase("GENERATING");
      const data = await fetchEdgeJson<Record<string, unknown>>("prep-tool", {
        tool_id: "system_design",
        input,
      }, {
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted || seq !== generationSeqRef.current) return;

      setGenPhase("VALIDATING_OUTPUT");
      const parsed = parseSystemDesignResponse(data);
      const result = parsed.markdown;
      const validation = validateSystemDesignOutput(result);
      if (validation.ok === false) {
        setGenPhase("FAILED");
        setError(validation.reason);
        toast.error(validation.reason);
        await refreshCredits().catch(() => undefined);
        return;
      }

      setBreakdown(result);
      setDiagramSpec(parsed.diagramSpec ?? null);
      diagramLoadedRef.current = null;
      setGenPhase("COMPLETED");
      inflightKeyRef.current = null;
      await refreshCredits().catch(() => undefined);
    } catch (err) {
      if (controller.signal.aborted || seq !== generationSeqRef.current) return;
      openUpgradeIfInsufficientCredits(err);
      const message = isAiProviderUnavailableError(err)
        ? AI_UNAVAILABLE
        : getAiUserFacingError(err);
      setGenPhase("FAILED");
      setError(message);
      toast.error(message);
      await refreshCredits().catch(() => undefined);
    } finally {
      if (seq === generationSeqRef.current) {
        genInFlightRef.current = false;
      }
    }
  }

  async function saveDesignNotes() {
    if (!user || !activeTopic || saving) return;
    const hasContent = notes.trim() || breakdown.trim();
    if (!hasContent) return;

    setSavePhase("SAVING");
    try {
      const answerText = notes.trim()
        ? `${notes.trim()}\n\n--- AI Breakdown ---\n${breakdown}`
        : breakdown;
      const created = await answerBankDB.create(user.id, {
        question_text: `System Design: ${activeTopic.title}`,
        answer_text: answerText,
        category: "System Design",
        source: "prep_lab",
      });
      setSavePhase("SAVED");
      setSavedAnswerId(created.id);
      toast.success("Design notes saved to Answer Bank");
      setTimeout(() => setSavePhase("IDLE"), 2500);
    } catch {
      setSavePhase("SAVE_FAILED");
      toast.error(SAVE_FAILED_MSG);
    }
  }

  function selectTopic(id: string) {
    if (generating || saving) return;
    abortRef.current?.abort();
    generationSeqRef.current += 1;
    genInFlightRef.current = false;
    setSelected(id);
    setBreakdown("");
    setNotes("");
    setDiagramSpec(null);
    diagramLoadedRef.current = null;
    setError(null);
    setGenPhase("IDLE");
    setSavePhase("IDLE");
    inflightKeyRef.current = null;
  }

  return (
    <div data-testid="dd-layout-root" className={`${PAGE_SHELL} space-y-4`}>
      <PageHeader
        title="System Design"
        description="Practice system design interviews with AI-guided breakdowns"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Prep Lab", href: "/app/prep" },
          { label: "System Design" },
        ]}
      />

      <PrepToolShell
        title="Structured design"
        description="Generate a breakdown, then save exactly once to Answer Bank."
        isGenerating={generating}
        generationLabel="Generating system design sections…"
        error={error}
        onRetry={() => void getAIBreakdown()}
      >
      {savedAnswerId && (
        <SaveToAnswerBankConfirm
          answerId={savedAnswerId}
          onDismiss={() => setSavedAnswerId(null)}
        />
      )}

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <LayoutTemplate className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-widest">
            Template presets
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SYSTEM_DESIGN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                whiteboardRef.current?.loadPreset(preset.id);
                setActivePreset(preset.id);
                toast.success(`${preset.label} template loaded on whiteboard`);
              }}
              className={cn(
                "px-3 py-2 rounded-xl border text-xs font-medium transition-all text-left",
                activePreset === preset.id
                  ? "bg-primary/20 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="block font-semibold">{preset.label}</span>
              <span className="block text-[10px] opacity-80 mt-0.5">{preset.description}</span>
            </button>
          ))}
        </div>
      </Card>

      <div data-testid="system-design-split" className="flex flex-col lg:flex-row gap-5">
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
              type="button"
              onClick={() => selectTopic(topic.id)}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl border transition-all",
                selected === topic.id
                  ? "bg-primary/10 border-primary/30"
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
                  onChange={(e) => {
                    setNotes(e.target.value);
                    inflightKeyRef.current = null;
                    if (genPhase === "COMPLETED" || genPhase === "FAILED") {
                      setGenPhase("IDLE");
                    }
                  }}
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

              {savePhase === "SAVE_FAILED" && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <p className="text-sm text-amber-200">{SAVE_FAILED_MSG}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => void saveDesignNotes()}
                    disabled={saving}
                  >
                    Retry save
                  </Button>
                </Card>
              )}

              <div className="flex gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void getAIBreakdown()}
                  disabled={generating || saving || !credits.canAfford("system_design")}
                  loading={generating}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Get AI breakdown ({credits.costs.system_design} credits)
                </Button>
                {(notes.trim() || breakdown) && (
                  <Button
                    variant={savePhase === "SAVED" ? "success" : "secondary"}
                    size="sm"
                    onClick={() => void saveDesignNotes()}
                    disabled={saving || generating}
                    loading={saving}
                    leftIcon={savePhase === "SAVED" ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  >
                    {savePhase === "SAVED" ? "Saved!" : "Save"}
                  </Button>
                )}
              </div>

              {breakdown && genPhase === "COMPLETED" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-xs font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Design Breakdown
                    </p>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(breakdown); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Copy full breakdown"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {breakdownSections.map((section, index) => (
                    <Card key={`${index}-${section.title}`} className="border-primary/20 bg-primary/5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-foreground mb-2">{section.title}</h3>
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{section.body}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Sketch your design
                  </p>
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline min-h-11 px-2"
                    onClick={() => setBoardMode(useNotesOnly ? "board" : "notes")}
                  >
                    {useNotesOnly ? "Show whiteboard" : "Use notes only"}
                  </button>
                </div>
                {useNotesOnly ? (
                  <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border p-4 leading-relaxed">
                    {prefersReducedMotion && boardMode === "auto"
                      ? "Reduced motion is on — sketch in the notes field above (components, data flow, tradeoffs). Switch to whiteboard anytime."
                      : "Notes-only mode — capture your design outline in the notes field above."}
                  </p>
                ) : (
                  <Whiteboard ref={whiteboardRef} height={380} />
                )}
              </div>
            </>
          ) : (
            <div data-testid="system-design-empty">
              <Card className="text-center py-10">
                <Server className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Select a system design topic</p>
                <p className="text-muted-foreground text-xs mt-1">Get AI-powered component breakdowns and scaling strategies</p>
              </Card>
            </div>
          )}
        </div>
      </div>
      </PrepToolShell>
    </div>
  );
}
