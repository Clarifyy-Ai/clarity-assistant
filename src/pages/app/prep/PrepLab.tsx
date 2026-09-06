import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { PlanGate } from "@/components/layout/PlanGate";
import { SaveToAnswerBankConfirm } from "@/components/prep/PrepToolShell";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import {
  Star, BookOpen, Zap,
  Brain, ChevronRight, RefreshCw,
  CheckCircle, Copy, Save, Sparkles,
  Building2, Target, FileSearch, Mail, DollarSign, Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { answerBankDB } from "@/lib/supabase/database";
import { refreshCreditsFromStore } from "@/lib/billing/creditPrecheck";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { withPrepToolContext } from "@/lib/prep/prepToolContext";
import { generateCompanyBrief, userFacingCompanyBriefError, cancelCompanyResearchJob, isCompanyBriefInFlight, type CompanyBriefJob } from "@/lib/company/companyResearchJob";
import { saveActiveCompanyJob, clearActiveCompanyJob } from "@/lib/company/companyResearchSession";
import { normalizeCompanyName } from "@/lib/company/normalizeCompanyName";
import { companyProfilePath } from "@/lib/company/slug";
import { supabase } from "@/lib/supabase/client";
import { createIdempotencyKey } from "@/lib/api/functions";
import { prepToolContentIdempotencyKey } from "@/lib/network/idempotency";
import { sha256 } from "@/lib/utils/hashUtils";
import {
  getAiUserFacingError,
  isAiProviderUnavailableError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { HybridSourceLine } from "@/components/hybrid/HybridSourceLine";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  StarBuilderForm,
  type StarFieldKey,
  type StarFields,
  parseStarResponse,
  buildStarAnswerText,
} from "@/components/prep/StarBuilderForm";
// Only tools with an explicit catalog mapping are chargeable / runnable.
const PREP_TOOL_COSTS: Record<string, number> = {
  coding_hint: AI_CREDIT_COSTS.coding_hint,
  coding_solution: AI_CREDIT_COSTS.live_answer,
  rephrase: AI_CREDIT_COSTS.rephraser,
  project_build: AI_CREDIT_COSTS.project_builder,
  star_method: AI_CREDIT_COSTS.star_builder,
  system_design: AI_CREDIT_COSTS.system_design,
  raw_prompt: AI_CREDIT_COSTS.rephraser,
};

function getPrepToolCost(toolId: string): number | null {
  const cost = PREP_TOOL_COSTS[toolId];
  return typeof cost === "number" && Number.isFinite(cost) && cost > 0 ? cost : null;
}

// ─────────────────────────────────────────────────────────────────
// PrepLab — STAR builder, Answer Bank, AI tools
// Tabs: STAR Builder | Answer Bank | AI Tools | Company Prep
// ─────────────────────────────────────────────────────────────────

export default function PrepLab() {
  const [searchParams] = useSearchParams();
  const toolParam = searchParams.get("tool");
  const defaultTab =
    toolParam === "jd_fit" ? "tools" : toolParam === "company" ? "company" : "star";

  return (
    <div className={PAGE_SHELL + " space-y-5"}>
      <PageHeader
        title={PRODUCT_NAMES.prepLab}
        description="Build STAR answers, review your Answer Bank, and use AI tools"
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.prepLab },
        ]}
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
          <TabsTrigger value="star" className="gap-1.5">
            <Star className="w-3.5 h-3.5" aria-hidden /> STAR Builder
          </TabsTrigger>
          <TabsTrigger value="bank" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" aria-hidden /> {PRODUCT_NAMES.answerBank}
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5">
            <Brain className="w-3.5 h-3.5" aria-hidden /> AI Tools
          </TabsTrigger>
          <TabsTrigger value="company" className="gap-1.5">
            <Building2 className="w-3.5 h-3.5" aria-hidden /> Company Prep
          </TabsTrigger>
        </TabsList>

        <TabsContent value="star">
          <STARBuilder />
        </TabsContent>

        <TabsContent value="bank">
          <AnswerBankPanel />
        </TabsContent>

        <TabsContent value="tools">
          <AITools initialToolId={toolParam === "jd_fit" ? "jd_fit" : undefined} />
        </TabsContent>

        <TabsContent value="company">
          <PlanGate requiredPlan="pro" featureFlag="company_research">
            <CompanyPrep />
          </PlanGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STAR Builder
// ─────────────────────────────────────────────────────────────────

function STARBuilder() {
  const { user }  = useAuthStore();
  const credits   = useCredits();
  const docStore  = useDocumentStore();

  const [question,   setQuestion]   = useState("");
  const [star, setStar] = useState<StarFields>({ situation: "", task: "", action: "", result: "" });
  const [generated,  setGenerated]  = useState("");
  const [loading,    setLoading]    = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [savingToBank, setSavingToBank] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedAnswerId, setSavedAnswerId] = useState<string | null>(null);
  const [aiLoading,  setAiLoading]  = useState<StarFieldKey | null>(null);
  const polishKeysRef = useRef<Partial<Record<StarFieldKey, string>>>({});
  const generateKeyRef = useRef<string | null>(null);
  const originalSectionRef = useRef<Partial<Record<StarFieldKey, string>>>({});
  const originalStarSnapshotRef = useRef<StarFields | null>(null);

  const wordCounts = Object.fromEntries(
    Object.entries(star).map(([k, v]) => [k, v.trim().split(/\s+/).filter(Boolean).length])
  ) as Record<StarFieldKey, number>;

  const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0);
  const isComplete = Object.values(star).every((v) => v.trim().length > 20);

  // ── AI polish one section ─────────────────────────────────────

  async function polishSection(key: StarFieldKey) {
    if (!credits.canAfford("star_analyse")) return;
    if (aiLoading) return;
    setAiLoading(key);
    originalSectionRef.current[key] = star[key];

    const currentText = star[key];
    const contentHash = await sha256(
      `polish_star:${key}:${question}:${currentText}`,
    );
    const idempotencyKey =
      polishKeysRef.current[key] ??
      prepToolContentIdempotencyKey("polish_star", contentHash);
    polishKeysRef.current[key] = idempotencyKey;

    try {
      // Server charges polish_star (2) via polish-star-section — not prep-tool raw_prompt/rephraser.
      const data = await fetchEdgeJson<{ polished?: string }>("polish-star-section", {
        section: key,
        currentText,
        questionText: question || undefined,
      }, {
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
      });

      const polished = typeof data?.polished === "string" ? data.polished.trim() : "";
      if (!polished) throw new Error("AI rewrite returned empty content.");
      setStar((p) => ({ ...p, [key]: polished }));
      polishKeysRef.current[key] = undefined;
      await refreshCreditsFromStore();
    } catch (err) {
      const prior = originalSectionRef.current[key];
      if (typeof prior === "string") {
        setStar((p) => ({ ...p, [key]: prior }));
      }
      openUpgradeIfInsufficientCredits(err);
      const msg = isAiProviderUnavailableError(err)
        ? "AI improvement is temporarily unavailable."
        : getAiUserFacingError(err);
      toast.error(msg);
      await refreshCreditsFromStore().catch(() => undefined);
    } finally {
      setAiLoading(null);
    }
  }

  // ── Generate full answer ──────────────────────────────────────

  async function generateFull() {
    if (!isComplete || !credits.canAfford("star_generate")) return;
    if (loading) return;
    setLoading(true);
    originalStarSnapshotRef.current = { ...star };

    const input =
      `Question: ${question || "(general behavioral)"}\n\n` +
      `Situation: ${star.situation}\nTask: ${star.task}\nAction: ${star.action}\nResult: ${star.result}\n\n` +
      `Resume context:\n${docStore.active_context?.resume?.content || "(none)"}`;
    const contentHash = await sha256(input);
    const idempotencyKey =
      generateKeyRef.current ??
      prepToolContentIdempotencyKey("star_method", contentHash);
    generateKeyRef.current = idempotencyKey;

    try {
      const data = await fetchEdgeJson<Record<string, unknown>>("prep-tool", await withPrepToolContext({
        tool_id: "star_method",
        input,
      }), {
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
      });

      const text = typeof data?.result === "string" ? data.result.trim() : "";
      if (!text) throw new Error("AI rewrite returned empty content.");
      const parts = parseStarResponse(text);
      setStar((p) => ({
        situation: parts.situation || p.situation,
        task: parts.task || p.task,
        action: parts.action || p.action,
        result: parts.result || p.result,
      }));
      setGenerated(buildStarAnswerText(parts) || text);
      generateKeyRef.current = null;
      await refreshCreditsFromStore();
    } catch (err) {
      openUpgradeIfInsufficientCredits(err);
      const msg = isAiProviderUnavailableError(err)
        ? "AI improvement is temporarily unavailable."
        : getAiUserFacingError(err);
      toast.error(msg);
      await refreshCreditsFromStore().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  // ── Save to Answer Bank ───────────────────────────────────────

  async function saveToBank() {
    if (!user || !generated || savingToBank) return;
    setSavingToBank(true);
    setSaveFailed(false);
    try {
      const created = await answerBankDB.create(user.id, {
        question_text: question,
        answer_text: generated,
        category: "STAR",
        source: "prep_lab",
        tags: ["star", "prep_lab"],
      });
      setSaved(true);
      setSavedAnswerId(created.id);
      toast.success("Saved to Answer Bank");
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveFailed(true);
      toast.error("Your improvement was generated but could not be saved.");
    } finally {
      setSavingToBank(false);
    }
  }

  return (
    <div className="space-y-5">
      <StarBuilderForm
        question={question}
        onQuestionChange={setQuestion}
        star={star}
        onStarChange={(key, value) => setStar((p) => ({ ...p, [key]: value }))}
        renderSectionActions={(key) =>
          star[key].trim().length > 10 ? (
            <button
              type="button"
              onClick={() => void polishSection(key)}
              disabled={!!aiLoading || !credits.canAfford("star_analyse")}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
            >
              {aiLoading === key ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Polish ({credits.costs.star_analyse} cr)
            </button>
          ) : null
        }
      />

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
          disabled={!isComplete || loading || !!aiLoading || !credits.canAfford("star_generate")}
          loading={loading}
          onClick={() => void generateFull()}
          leftIcon={<Zap className="w-4 h-4" />}
          fullWidth
        >
          Generate polished answer ({credits.costs.star_generate} credits)
        </Button>
        {generated && (
          <Button
            variant={saved ? "success" : "secondary"}
            size="md"
            onClick={() => void saveToBank()}
            disabled={savingToBank}
            loading={savingToBank}
            leftIcon={saved
              ? <CheckCircle className="w-4 h-4" />
              : <Save className="w-4 h-4" />
            }
          >
            {saveFailed ? "Retry save" : saved ? "Saved!" : "Save"}
          </Button>
        )}
      </div>
      {saveFailed && (
        <p className="text-sm text-amber-400">
          Your improvement was generated but could not be saved.
        </p>
      )}

      {/* Generated answer */}
      {savedAnswerId && (
        <SaveToAnswerBankConfirm
          answerId={savedAnswerId}
          onDismiss={() => setSavedAnswerId(null)}
        />
      )}
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
// Answer Bank panel — links to the shared Answer Bank (not a separate Q-bank)
// ─────────────────────────────────────────────────────────────────

const STARTER_ANSWER_TEMPLATES = [
  {
    id: "starter-behavioral",
    text: "Tell me about a time you resolved a conflict on your team.",
    category: "Behavioural",
    answerPreview:
      "Situation: Two engineers disagreed on API design during a release crunch. Task: I facilitated alignment without delaying the ship date. Action: I ran a 30-minute decision doc review, listed trade-offs, and proposed a phased rollout. Result: We shipped on time and reduced similar debates by documenting ADRs.",
  },
  {
    id: "starter-technical",
    text: "How would you debug a sudden spike in API latency?",
    category: "Technical",
    answerPreview:
      "I'd start with dashboards (p95/p99, error rate), check recent deploys and feature flags, then trace slow requests. I'd compare DB query plans, cache hit rates, and upstream dependencies, roll back if needed, and add an alert on the regression threshold.",
  },
  {
    id: "starter-leadership",
    text: "Describe how you mentored a junior teammate to deliver independently.",
    category: "Leadership",
    answerPreview:
      "I paired weekly on their first feature, broke work into milestones, and gave written feedback on PRs. Within six weeks they owned a module end-to-end and presented the demo to stakeholders.",
  },
];

type BankAnswer = {
  id: string;
  question_text: string;
  category: string | null;
};

function AnswerBankPanel() {
  const { user } = useAuthStore();
  const [answers, setAnswers] = useState<BankAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const rows = await answerBankDB.listByUserId(user.id);
        if (!cancelled) {
          setAnswers(
            rows.slice(0, 8).map((row: { id: string; question_text?: string; category?: string }) => ({
              id: row.id,
              question_text: (row.question_text ?? "").trim(),
              category: row.category ?? null,
            })).filter((a) => a.question_text.length > 0),
          );
        }
      } catch (err) {
        console.error("[PrepLab/AnswerBankPanel] load failed:", err);
        if (!cancelled) setAnswers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div className="space-y-4">
      <Card padding="sm" className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{PRODUCT_NAMES.answerBank}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            One library for saved STAR answers — open the full bank to add, edit, or review.
          </p>
        </div>
        <Link to="/app/answers">
          <Button variant="primary" size="sm" leftIcon={<BookOpen className="w-3.5 h-3.5" />}>
            Open {PRODUCT_NAMES.answerBank}
          </Button>
        </Link>
      </Card>

      {loading && (
        <p className="text-xs text-muted-foreground">Loading your saved answers…</p>
      )}

      {!loading && answers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recent answers
          </p>
          {answers.map((a) => (
            <Link key={a.id} to={`/app/answers/${a.id}`} className="block">
              <Card hover padding="sm" className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-relaxed line-clamp-2">
                    {a.question_text}
                  </p>
                  {a.category && (
                    <div className="mt-2">
                      <Badge variant="default" size="sm">{a.category}</Badge>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              </Card>
            </Link>
          ))}
          <div className="text-center pt-1">
            <Link to="/app/answers" className="text-sm text-primary hover:underline">
              View all in {PRODUCT_NAMES.answerBank} →
            </Link>
          </div>
        </div>
      )}

      {!loading && answers.length === 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Starter examples — save your own answers in {PRODUCT_NAMES.answerBank}.
          </p>
          {STARTER_ANSWER_TEMPLATES.map((starter) => (
            <Card key={starter.id} padding="sm" className="border-dashed border-primary/30">
              <p className="text-sm font-medium text-foreground">{starter.text}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="default" size="sm">{starter.category}</Badge>
                <Badge variant="primary" size="sm">Example</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                {starter.answerPreview}
              </p>
            </Card>
          ))}
          <div className="text-center pt-2">
            <Link to="/app/answers" className="text-sm text-primary hover:underline">
              Open {PRODUCT_NAMES.answerBank} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AI Tools
// ─────────────────────────────────────────────────────────────────

const AI_TOOLS: Array<{
  id: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  plan: "free" | "pro";
  /** When false, Launch must not call prep-tool (unpriced / not Edge-backed). */
  edgeReady?: boolean;
}> = [
  {
    id:    "jd_fit",
    icon:  Target,
    label: "JD Fit Analyser",
    desc:  "Upload a job description — AI rates how well your resume matches and gives a gap report.",
    plan:  "free",
    edgeReady: false,
  },
  {
    id:    "question_predict",
    icon:  FileSearch,
    label: "Question Predictor",
    desc:  "AI predicts the 10 most likely questions for your target role and company.",
    plan:  "free",
    edgeReady: false,
  },
  {
    id:    "cover_letter",
    icon:  Mail,
    label: "Cover Letter Writer",
    desc:  "Generate a tailored cover letter from your resume + JD in one click.",
    plan:  "pro",
    edgeReady: false,
  },
  {
    id:    "salary_coach",
    icon:  DollarSign,
    label: "Salary Negotiation Script",
    desc:  "AI writes a customised negotiation script based on role, location, and experience.",
    plan:  "pro",
    edgeReady: false,
  },
  {
    id:    "linkedin_headline",
    icon:  Briefcase,
    label: "LinkedIn Headline Optimiser",
    desc:  "Rewrite your headline to attract more recruiters for your target roles.",
    plan:  "pro",
    edgeReady: false,
  },
  {
    id:    "culture_fit",
    icon:  Building2,
    label: "Culture Fit Scorer",
    desc:  "Analyses your answers against a company's stated values and culture.",
    plan:  "pro",
    edgeReady: false,
  },
];

function AITools({ initialToolId }: { initialToolId?: string }) {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [activeToolId, setActiveToolId] = useState<string | null>(initialToolId ?? null);

  useEffect(() => {
    if (initialToolId) setActiveToolId(initialToolId);
  }, [initialToolId]);
  const isPro = profile?.plan_id !== "free";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {AI_TOOLS.map((tool) => {
        const locked = tool.plan === "pro" && !isPro;
        const edgeReady = tool.edgeReady !== false && getPrepToolCost(tool.id) != null;
        return (
          <Card
            key={tool.id}
            hover={!locked}
            onClick={locked ? undefined : () => {
              if (tool.id === "jd_fit") {
                toast.message("Upload a resume and job description to run gap analysis.");
                navigate("/app/documents?highlight=gap-analysis");
                return;
              }
              if (!edgeReady) {
                toast.message("This prep tool is not available yet — no credits were charged.");
                return;
              }
              setActiveToolId(tool.id);
            }}
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
            {!locked && !edgeReady && tool.id !== "jd_fit" && (
              <div className="absolute top-3 right-3">
                <Badge variant="secondary" size="sm">Unavailable</Badge>
              </div>
            )}
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <tool.icon className="h-5 w-5 text-primary" />
            </span>
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
              {locked
                ? "Upgrade to use"
                : tool.id === "jd_fit"
                  ? "Open gap analysis"
                  : edgeReady
                    ? "Launch tool"
                    : "Unavailable"}
            </Button>
          </Card>
        );
      })}

      {/* Tool modal */}
      <AIToolModal
        toolId={activeToolId === "jd_fit" ? null : activeToolId}
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
  const credits = useCredits();
  const tool = AI_TOOLS.find((t) => t.id === toolId);
  const toolCost = toolId ? getPrepToolCost(toolId) : null;
  const [input,  setInput]  = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput("");
    setOutput("");
  }, [toolId]);

  async function run() {
    if (!input.trim() || loading || !toolId || toolCost == null) return;
    setLoading(true);

    try {

      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", await withPrepToolContext({
        tool_id: toolId,
        input,
      }), {
        headers: {
          "Idempotency-Key": createIdempotencyKey("prep-tool"),
        },
      });
      setOutput(data.result ?? "");
      await refreshCreditsFromStore();
    } catch (err) {
      console.error("AI tool run() failed:", err);
      openUpgradeIfInsufficientCredits(err);
      toast.error(getAiUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!tool) return null;

  return (
    <Modal open={!!toolId} onClose={onClose} title={tool.label} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{tool.desc}</p>
        {toolCost == null ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            This tool is not available yet. No credits will be charged.
          </p>
        ) : null}
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
          disabled={!input.trim() || toolCost == null || credits.balance < (toolCost ?? 0)}
          onClick={run}
          leftIcon={<Sparkles className="w-4 h-4" />}
        >
          {toolCost == null ? "Unavailable" : `Run AI tool (${toolCost} credits)`}
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
  const credits = useCredits();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [company,  setCompany]  = useState("");
  const [role,     setRole]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [brief,    setBrief]    = useState<any>(null);
  const [briefSource, setBriefSource] = useState<string | null>(null);
  const [job, setJob] = useState<CompanyBriefJob | null>(null);
  const [savedBriefs, setSavedBriefs] = useState<Array<{ id: string; company_name: string; role_title: string | null; created_at: string }>>([]);
  const abortRef = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("company_research")
      .select("id, company_name, role_title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setSavedBriefs(data ?? []));
  }, [user?.id, brief]);

  async function generate() {
    if (!company.trim() || !role.trim()) return;
    if (loading || inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current = false;
    setLoading(true);
    setBrief(null);
    setBriefSource(null);
    setJob(null);
    try {
      const result = await generateCompanyBrief({
        company: company.trim(),
        role: role.trim(),
        force: true,
        userId: user?.id,
        shouldAbort: () => abortRef.current,
        onJob: (next) => {
          jobIdRef.current = next.jobId || jobIdRef.current;
          setJob(next);
          if (next.jobId && user?.id && isCompanyBriefInFlight(next.status)) {
            saveActiveCompanyJob({
              jobId: next.jobId,
              company: company.trim(),
              role: role.trim(),
              userId: user.id,
              companyNormalized: normalizeCompanyName(company.trim()),
            });
          }
        },
      });

      if (!result?.brief) {
        toast.error("Research was generated, but we couldn't save it. Please retry.");
        return;
      }

      clearActiveCompanyJob(jobIdRef.current ?? undefined);
      setBrief(result.brief);
      setBriefSource(result.source ?? null);
      await refreshCreditsFromStore();
    } catch (err) {
      openUpgradeIfInsufficientCredits(err);
      toast.error(userFacingCompanyBriefError(err));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  async function cancelGenerate() {
    abortRef.current = true;
    const id = jobIdRef.current;
    if (id) {
      try {
        await cancelCompanyResearchJob(id);
      } catch {
        /* ignore */
      }
      clearActiveCompanyJob(id);
    }
    inFlightRef.current = false;
    setLoading(false);
    setJob(null);
    toast.message("Generation cancelled.");
  }

  const progressLabel = job
    ? String(job.progressStage ?? job.status ?? "processing")
    : null;

  return (
    <div className="space-y-5">
      {savedBriefs.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent briefs</h3>
          <div className="space-y-2">
            {savedBriefs.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(companyProfilePath(row.company_name))}
                className="w-full text-left flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 hover:bg-secondary/50 text-sm"
              >
                <span className="font-medium truncate">{row.company_name}</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
          <Link to="/app/companies" className="text-xs text-primary hover:underline mt-3 inline-block">
            View all company research →
          </Link>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Generate company prep brief
        </h3>
        {loading && progressLabel && (
          <p className="text-xs text-muted-foreground mb-3 capitalize">
            {progressLabel.replace(/_/g, " ")}…
          </p>
        )}
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
          disabled={!company.trim() || !role.trim() || loading || !credits.canAfford("company_brief")}
          onClick={() => void generate()}
          leftIcon={<Building2 className="w-4 h-4" />}
        >
          Generate prep brief ({AI_CREDIT_COSTS.company_research} credits)
        </Button>
        {loading && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void cancelGenerate()}
          >
            Cancel
          </Button>
        )}
      </Card>

      {brief && (
        <div className="space-y-4">
          <HybridSourceLine source={briefSource} />
          {/* Overview */}
          {brief.overview && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
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
