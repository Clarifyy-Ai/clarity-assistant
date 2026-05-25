// @ts-nocheck -- retained: complex Supabase row types with manual schema columns not in generated types; removing suppression produces implicit-any cascade across all data accesses.
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { PlanGate } from "@/components/layout/PlanGate";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import {
  FlaskConical, Star, BookOpen, Zap,
  Brain, FileText, ChevronRight, RefreshCw,
  CheckCircle, Copy, Save, Sparkles,
  Building2, Target, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { EDGE_BASE } from "@/lib/env";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { Link, useSearchParams } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────
// PrepLab — STAR builder, question bank, AI tools
// Tabs: STAR Builder | Question Bank | AI Tools | Company Prep
// ─────────────────────────────────────────────────────────────────

export default function PrepLab() {
  const [searchParams] = useSearchParams();
  const toolParam = searchParams.get("tool");
  const defaultTab =
    toolParam === "jd_fit" ? "tools" : toolParam === "company" ? "company" : "star";

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Prep Lab"
        description="Build STAR answers, study questions, and use AI tools"
      />
      <div className="flex flex-wrap gap-2 -mt-2">
        {[
          { to: "/app/prep/star-builder", label: "STAR Builder" },
          { to: "/app/prep/rephraser", label: "Rephraser" },
          { to: "/app/prep/coding-hints", label: "Coding Hints" },
          { to: "/app/prep/system-design", label: "System Design" },
          { to: "/app/prep/project-builder", label: "Project Builder" },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Tabs defaultValue={defaultTab} key={defaultTab}>
        <TabsList>
          <TabsTrigger value="star">⭐ STAR Builder</TabsTrigger>
          <TabsTrigger value="bank">📚 Question Bank</TabsTrigger>
          <TabsTrigger value="tools">🤖 AI Tools</TabsTrigger>
          <TabsTrigger value="company">🏢 Company Prep</TabsTrigger>
        </TabsList>

        <TabsContent value="star">
          <STARBuilder />
        </TabsContent>

        <TabsContent value="bank">
          <QuestionBank />
        </TabsContent>

        <TabsContent value="tools">
          <AITools initialToolId={toolParam === "jd_fit" ? "jd_fit" : undefined} />
        </TabsContent>

        <TabsContent value="company">
          <CompanyPrep />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STAR Builder
// ─────────────────────────────────────────────────────────────────

const STAR_PROMPTS = {
  situation: "Set the scene. What was the context? When and where did this happen?",
  task:      "What was your responsibility or challenge in this situation?",
  action:    "What specific steps did YOU take? Use 'I', not 'we'.",
  result:    "What was the outcome? Include metrics if possible (%, $, time saved).",
};

function STARBuilder() {
  const { user }  = useAuthStore();
  const credits   = useCredits();
  const docStore  = useDocumentStore();

  const [question,   setQuestion]   = useState("");
  const [star, setStar] = useState({ situation: "", task: "", action: "", result: "" });
  const [generated,  setGenerated]  = useState("");
  const [loading,    setLoading]    = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [aiLoading,  setAiLoading]  = useState<keyof typeof star | null>(null);

  const wordCounts = Object.fromEntries(
    Object.entries(star).map(([k, v]) => [k, v.trim().split(/\s+/).filter(Boolean).length])
  );

  const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0);
  const isComplete = Object.values(star).every((v) => v.trim().length > 20);

  // ── AI polish one section ─────────────────────────────────────

  async function polishSection(key: keyof typeof star) {
    if (!credits.canAfford("star_analyse")) return;
    setAiLoading(key);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");


      const res = await fetch(`${EDGE_BASE}/polish-star-section`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          section:      key,
          currentText:  star[key],
          questionText: question || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Polish failed: ${res.status}`);

      const envelope = await res.json();
      if (envelope.success && envelope.data?.polished) {
        setStar((p) => ({ ...p, [key]: envelope.data.polished }));
        await refreshCredits();
      }
    } catch (err) {
      console.error("polishSection failed:", err);
      toast.error("Failed to polish section. Please try again.");
    } finally {
      setAiLoading(null);
    }
  }

  // ── Generate full answer ──────────────────────────────────────

  async function generateFull() {
    if (!isComplete || !credits.canAfford("star_generate")) return;
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");


      const res = await fetch(`${EDGE_BASE}/generate-star-answer`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionText: question,
          resumeText: [
            docStore.active_context?.resume?.content || "",
            "",
            "User STAR draft (polish and integrate):",
            `Situation: ${star.situation}`,
            `Task: ${star.task}`,
            `Action: ${star.action}`,
            `Result: ${star.result}`,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });

      if (!res.ok) throw new Error(`Generate failed: ${res.status}`);

      const envelope = await res.json();
      if (envelope.success && envelope.data) {
        setGenerated(envelope.data.fullAnswer ?? "");
        await refreshCredits();
      }
    } catch (err) {
      console.error("generateFull failed:", err);
      toast.error("Failed to generate answer. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Save to Answer Bank ───────────────────────────────────────

  async function saveToBank() {
    if (!user || !generated) return;
    try {
      const { error } = await supabase.from("answer_bank").insert({
        user_id: user.id,
        question_text: question,
        answer_text: generated,
        category: "STAR",
        source: "prep_lab",
        tags: ["star", "prep_lab"],
      });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err?.message ?? "Failed to save answer. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Question input */}
      <Card>
        <p className="text-xs font-medium text-foreground mb-2">
          Interview question you're preparing for
        </p>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Tell me about a time you resolved a conflict at work."
          className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
        />
      </Card>

      {/* STAR sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(STAR_PROMPTS) as (keyof typeof STAR_PROMPTS)[]).map((key) => (
          <Card key={key}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-black uppercase px-2 py-0.5 rounded-lg",
                  key === "situation" ? "bg-blue-500/10 text-blue-400" :
                  key === "task"      ? "bg-violet-500/10 text-violet-400" :
                  key === "action"    ? "bg-emerald-500/10 text-emerald-400" :
                                        "bg-amber-500/10 text-amber-400"
                )}>
                  {key[0].toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-foreground capitalize">{key}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {wordCounts[key]}w
                </span>
                {star[key].trim().length > 10 && (
                  <button
                    onClick={() => polishSection(key)}
                    disabled={aiLoading === key || !credits.canAfford("star_analyse")}
                    className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-40"
                  >
                    {aiLoading === key ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Polish
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">{STAR_PROMPTS[key]}</p>
            <textarea
              value={star[key]}
              onChange={(e) => setStar((p) => ({ ...p, [key]: e.target.value }))}
              placeholder={`Write your ${key}…`}
              rows={3}
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </Card>
        ))}
      </div>

      {/* Word count bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalWords} words total</span>
        <span className={cn(
          totalWords >= 150 && totalWords <= 400
            ? "text-emerald-400"
            : "text-amber-400"
        )}>
          {totalWords < 150 ? "Too short — aim for 150–400 words" :
           totalWords > 400 ? "Too long — trim to under 400 words" :
           "✓ Good length"}
        </span>
      </div>

      {/* Generate + save row */}
      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={!isComplete || loading || !credits.canAfford("star_generate")}
          loading={loading}
          onClick={generateFull}
          leftIcon={<Zap className="w-4 h-4" />}
          fullWidth
        >
          Generate polished answer
        </Button>
        {generated && (
          <Button
            variant={saved ? "success" : "secondary"}
            size="md"
            onClick={saveToBank}
            leftIcon={saved
              ? <CheckCircle className="w-4 h-4" />
              : <Save className="w-4 h-4" />
            }
          >
            {saved ? "Saved!" : "Save"}
          </Button>
        )}
      </div>

      {/* Generated answer */}
      {generated && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
              Generated answer
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(generated)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {generated}
          </p>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Question Bank
// ─────────────────────────────────────────────────────────────────

const BANK_CATEGORIES = [
  "All", "Behavioural", "Technical", "System Design",
  "Leadership", "Conflict", "Culture Fit", "HR",
];

type BankQuestion = {
  id: string;
  text: string;
  category: string;
  difficulty: string;
  fromLibrary?: boolean;
};

const STARTER_QUESTIONS: BankQuestion[] = [
  { id: "starter-1", text: "Tell me about a time you failed and what you learned.", category: "Behavioural", difficulty: "medium" },
  { id: "starter-2", text: "Describe a situation where you had to meet a tight deadline.", category: "Behavioural", difficulty: "easy" },
];

function QuestionBank() {
  const { user } = useAuthStore();
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [category,   setCategory]   = useState("All");
  const [search,     setSearch]     = useState("");
  const [practicing, setPracticing] = useState<string | null>(null);
  const [answer,     setAnswer]     = useState("");
  const [questions,  setQuestions]  = useState<BankQuestion[]>(STARTER_QUESTIONS);
  const [loadingBank, setLoadingBank] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBank() {
      if (!user?.id) {
        setLoadingBank(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("answer_bank")
          .select("id, question_text, category, tags")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(100);

        if (error) throw error;

        const fromBank: BankQuestion[] = (data ?? [])
          .map((row: { id: string; question_text?: string; category?: string; tags?: string[] }) => ({
            id: row.id,
            text: (row.question_text ?? "").trim(),
            category: row.category ?? "Behavioural",
            difficulty: "medium",
            fromLibrary: true,
          }))
          .filter((q) => q.text.length > 8);

        if (!cancelled) {
          setQuestions(fromBank.length > 0 ? fromBank : STARTER_QUESTIONS);
        }
      } catch (err) {
        console.error("[PrepLab/QuestionBank] load failed:", err);
        if (!cancelled) setQuestions(STARTER_QUESTIONS);
      } finally {
        if (!cancelled) setLoadingBank(false);
      }
    }

    void loadBank();
    return () => { cancelled = true; };
  }, [user?.id]);

  const filtered = questions.filter((q) => {
    if (category !== "All" && q.category !== category) return false;
    if (search && !q.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeQ = questions.find((q) => q.id === practicing);

  async function savePracticeToBank() {
    if (!user || !activeQ || answer.trim().length < 8) return;
    try {
      const { error } = await supabase.from("answer_bank").insert({
        user_id: user.id,
        question_text: activeQ.text,
        answer_text: answer.trim(),
        category: activeQ.category,
        source: "prep_lab_practice",
        tags: ["practice"],
      });
      if (error) throw error;
      toast.success("Practice answer saved to your bank.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save answer.");
    }
  }

  async function getPracticeFeedback() {
    if (!activeQ || answer.trim().length < 20) return;
    setFeedbackLoading(true);
    setFeedbackText(null);
    try {
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "star_method",
        input: `Question: ${activeQ.text}\n\nCandidate answer:\n${answer.trim()}\n\nGive concise STAR feedback: strengths, gaps, and one improved opening sentence.`,
      });
      setFeedbackText(data.result ?? "No feedback returned.");
      await refreshCredits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get feedback.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          className="w-full sm:w-64 bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
        />
        <div className="flex flex-wrap gap-1.5">
          {BANK_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                category === c
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loadingBank && (
        <p className="text-xs text-muted-foreground">Loading your saved questions…</p>
      )}

      {!loadingBank && questions.every((q) => !q.fromLibrary) && (
        <p className="text-xs text-muted-foreground">
          Save STAR answers to your answer bank to build a personal question library. Showing starter examples until then.
        </p>
      )}

      {/* Questions list */}
      <div className="space-y-2">
        {filtered.length === 0 && !loadingBank && (
          <p className="text-sm text-muted-foreground py-6 text-center">No questions match your filters.</p>
        )}
        {filtered.map((q) => (
          <Card
            key={q.id}
            hover
            padding="sm"
            className="flex items-start gap-4"
          >
            <div className="flex-1">
              <p className="text-sm text-foreground leading-relaxed">{q.text}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="default" size="sm">{q.category}</Badge>
                <Badge
                  variant={
                    q.difficulty === "easy"   ? "emerald" :
                    q.difficulty === "medium" ? "amber"   : "red"
                  }
                  size="sm"
                >
                  {q.difficulty}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => { setPracticing(q.id); setAnswer(""); }}
                leftIcon={<MessageSquare className="w-3 h-3" />}
              >
                Practice
              </Button>
              <Button
                variant="ghost"
                size="xs"
                leftIcon={<Save className="w-3 h-3" />}
                onClick={async () => {
                  if (!user) return;
                  try {
                    const { error } = await supabase.from("answer_bank").insert({
                      user_id: user.id,
                      question_text: q.text,
                      answer_text: "(Draft — open Practice to add your answer)",
                      category: q.category,
                      source: "prep_lab_bank",
                      tags: ["saved_question"],
                    });
                    if (error) throw error;
                    toast.success("Question saved to your bank.");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to save.");
                  }
                }}
              >
                Save
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Practice modal */}
      <Modal
        open={!!practicing}
        onClose={() => setPracticing(null)}
        title="Practice answer"
        size="lg"
      >
        {activeQ && (
          <div className="space-y-4">
            <div className="bg-accent/5 rounded-xl p-4">
              <p className="text-sm font-medium text-foreground">{activeQ.text}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="default" size="sm">{activeQ.category}</Badge>
                <Badge
                  variant={
                    activeQ.difficulty === "easy"   ? "emerald" :
                    activeQ.difficulty === "medium" ? "amber" : "red"
                  }
                  size="sm"
                >
                  {activeQ.difficulty}
                </Badge>
              </div>
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer using STAR format…"
              rows={6}
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
            {feedbackText && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {feedbackText}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPracticing(null)}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={answer.trim().length < 8}
                leftIcon={<Save className="w-3.5 h-3.5" />}
                onClick={() => void savePracticeToBank()}
              >
                Save answer
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={answer.trim().length < 20 || feedbackLoading}
                leftIcon={<Zap className="w-3.5 h-3.5" />}
                onClick={() => void getPracticeFeedback()}
              >
                {feedbackLoading ? "Analyzing…" : "Get AI feedback"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AI Tools
// ─────────────────────────────────────────────────────────────────

const AI_TOOLS = [
  {
    id:    "jd_fit",
    icon:  "🎯",
    label: "JD Fit Analyser",
    desc:  "Upload a job description — AI rates how well your resume matches and gives a gap report.",
    plan:  "free",
  },
  {
    id:    "question_predict",
    icon:  "🔮",
    label: "Question Predictor",
    desc:  "AI predicts the 10 most likely questions for your target role and company.",
    plan:  "free",
  },
  {
    id:    "cover_letter",
    icon:  "✉️",
    label: "Cover Letter Writer",
    desc:  "Generate a tailored cover letter from your resume + JD in one click.",
    plan:  "pro",
  },
  {
    id:    "salary_coach",
    icon:  "💰",
    label: "Salary Negotiation Script",
    desc:  "AI writes a customised negotiation script based on role, location, and experience.",
    plan:  "pro",
  },
  {
    id:    "linkedin_headline",
    icon:  "💼",
    label: "LinkedIn Headline Optimiser",
    desc:  "Rewrite your headline to attract more recruiters for your target roles.",
    plan:  "pro",
  },
  {
    id:    "culture_fit",
    icon:  "🏢",
    label: "Culture Fit Scorer",
    desc:  "Analyses your answers against a company's stated values and culture.",
    plan:  "pro",
  },
];

function AITools({ initialToolId }: { initialToolId?: string }) {
  const { profile } = useAuthStore();
  const [activeToolId, setActiveToolId] = useState<string | null>(initialToolId ?? null);

  useEffect(() => {
    if (initialToolId) setActiveToolId(initialToolId);
  }, [initialToolId]);
  const isPro = profile?.plan_id !== "free";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {AI_TOOLS.map((tool) => {
        const locked = tool.plan === "pro" && !isPro;
        return (
          <Card
            key={tool.id}
            hover={!locked}
            onClick={locked ? undefined : () => setActiveToolId(tool.id)}
            className={cn(
              "flex flex-col gap-3 relative",
              locked && "opacity-60"
            )}
          >
            {locked && (
              <div className="absolute top-3 right-3">
                <Badge variant="amber" size="sm">Pro</Badge>
              </div>
            )}
            <span className="text-3xl">{tool.icon}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{tool.label}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tool.desc}</p>
            </div>
            <Button
              variant={locked ? "ghost" : "secondary"}
              size="xs"
              disabled={locked}
              className="mt-auto w-fit"
              rightIcon={<ChevronRight className="w-3 h-3" />}
            >
              {locked ? "Upgrade to use" : "Launch tool"}
            </Button>
          </Card>
        );
      })}

      {/* Tool modal */}
      <AIToolModal
        toolId={activeToolId}
        onClose={() => setActiveToolId(null)}
      />
    </div>
  );
}

function AIToolModal({
  toolId,
  onClose,
}: {
  toolId:  string | null;
  onClose: () => void;
}) {
  const tool = AI_TOOLS.find((t) => t.id === toolId);
  const [input,  setInput]  = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput("");
    setOutput("");
  }, [toolId]);

  async function run() {
    if (!input.trim()) return;
    setLoading(true);

    try {

      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: toolId,
        input,
      });
      setOutput(data.result ?? "");
    } catch (err) {
      console.error("AI tool run() failed:", err);
      toast.error("The AI tool failed to run. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!tool) return null;

  return (
    <Modal open={!!toolId} onClose={onClose} title={tool.label} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{tool.desc}</p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste your resume, job description, or context here…"
          rows={5}
          className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
        />
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          disabled={!input.trim()}
          onClick={run}
          leftIcon={<Sparkles className="w-4 h-4" />}
        >
          Run AI tool
        </Button>
        {output && (
          <div className="bg-secondary border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">
                Result
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(output)}
                className="text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {output}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// Company Prep
// ─────────────────────────────────────────────────────────────────

function CompanyPrep() {
  const [company,  setCompany]  = useState("");
  const [role,     setRole]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [brief,    setBrief]    = useState<any>(null);

  async function generate() {
    if (!company.trim() || !role.trim()) return;
    setLoading(true);
    setBrief(null);
    try {
      const data = await fetchEdgeJson<{
        overview?: string;
        questions?: string[];
        culture?: string;
        tips?: string[];
      }>("company-research", { company: company.trim(), role: role.trim() });
      setBrief(data);
      await refreshCredits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load company brief.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Generate company prep brief
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Company name</p>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Role you're applying for</p>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>
        </div>
        <Button
          variant="primary"
          size="md"
          loading={loading}
          disabled={!company.trim() || !role.trim()}
          onClick={generate}
          leftIcon={<Building2 className="w-4 h-4" />}
        >
          Generate prep brief
        </Button>
      </Card>

      {brief && (
        <div className="space-y-4">
          {/* Overview */}
          {brief.overview && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-violet-400" />
                Company overview
              </h3>
              <p className="text-sm text-foreground leading-relaxed">{brief.overview}</p>
            </Card>
          )}

          {/* Likely questions */}
          {brief.questions?.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                Likely interview questions
              </h3>
              <ul className="space-y-2">
                {brief.questions.map((q: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                    <span className="text-muted-foreground shrink-0 tabular-nums">{i + 1}.</span>
                    {q}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Values + culture */}
          {brief.values?.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                Company values to reference
              </h3>
              <div className="flex flex-wrap gap-2">
                {brief.values.map((v: string) => (
                  <Badge key={v} variant="amber" size="sm">{v}</Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Tips */}
          {brief.tips?.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-blue-400" />
                Pro tips for this company
              </h3>
              <ul className="space-y-2">
                {brief.tips.map((t: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="text-blue-400 shrink-0 mt-0.5">→</span>
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
