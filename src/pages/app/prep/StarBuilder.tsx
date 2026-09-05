import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { withPrepToolContext } from "@/lib/prep/prepToolContext";
import { prepToolContentIdempotencyKey } from "@/lib/network/idempotency";
import { sha256 } from "@/lib/utils/hashUtils";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useCredits } from "@/hooks/useCredits";
import { evaluateActionCreditGate } from "@/lib/billing/actionCreditGate";
import { InsufficientCreditsAction } from "@/components/billing/InsufficientCreditsAction";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  getAiUserFacingError,
  isAiProviderUnavailableError,
  isInsufficientCreditsError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  StarBuilderForm,
  buildStarAnswerText,
  parseSavedStarAnswer,
  parseStarResponse,
  type StarFields,
} from "@/components/prep/StarBuilderForm";
import { PrepToolShell } from "@/components/prep/PrepToolShell";
import {
  Star, Sparkles, Save, Loader2, BookOpen, Trash2, Pencil, Filter, ArrowLeft,
} from "lucide-react";
import {
  assessStarFactualIntegrity,
  starSectionsToText,
} from "@/lib/prep/starFactualIntegrity";
import {
  isInputBasedPrepDraft,
  parsePrepToolMeta,
  prepDraftBadgeLabel,
} from "@/lib/prep/prepToolMeta";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { answerBankDB } from "@/lib/supabase/database";

const EXAMPLES = [
  "Tell me about a time you led a team through a difficult project.",
  "Describe a situation where you had to deal with a tight deadline.",
  "Give an example of how you resolved a conflict at work.",
  "Tell me about a time you failed and what you learned.",
];

type StarStory = Tables<"answer_bank">;
type AiPhase = "IDLE" | "GENERATING" | "GENERATED" | "GENERATION_FAILED";
type SavePhase = "IDLE" | "SAVING" | "SAVED" | "SAVE_FAILED";

const EMPTY_STAR: StarFields = { situation: "", task: "", action: "", result: "" };
const AI_REWRITE_UNAVAILABLE = "AI rewrite is temporarily unavailable.";
const SAVE_FAILED_MSG =
  "Your improvement was generated but could not be saved.";

export default function StarBuilder() {
  const { user } = useAuthStore();
  const credits = useCredits();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const backHref =
    returnTo && returnTo.startsWith("/app/") && !returnTo.startsWith("//")
      ? returnTo
      : "/app/prep";

  const [question, setQuestion] = useState("");
  const [star, setStar] = useState<StarFields>(EMPTY_STAR);
  const [competencyTag, setCompetencyTag] = useState("");
  const [aiPhase, setAiPhase] = useState<AiPhase>("IDLE");
  const [polishError, setPolishError] = useState<string | null>(null);
  const [creditDenied, setCreditDenied] = useState(false);
  const [draftBadge, setDraftBadge] = useState<string | null>(null);
  const [savePhase, setSavePhase] = useState<SavePhase>("IDLE");
  const polishKeyRef = useRef<string | null>(null);
  const polishInFlightRef = useRef(false);
  const originalStarRef = useRef<StarFields | null>(null);
  const [hasOriginalDraft, setHasOriginalDraft] = useState(false);
  const polishing = aiPhase === "GENERATING";
  const saving = savePhase === "SAVING";
  const dirtyRef = useRef(false);

  const [stories, setStories] = useState<StarStory[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasContent = Object.values(star).some((value) => value.trim().length > 0);

  const loadStories = useCallback(async () => {
    if (!user?.id) {
      setStories([]);
      setLoadingStories(false);
      return;
    }
    setLoadingStories(true);
    try {
      const rows = await answerBankDB.listByUserId(user.id);
      setStories(rows.filter((row) => row.tags?.includes("star") || row.source === "prep_lab"));
    } catch {
      toast.error("Could not load STAR library.");
    } finally {
      setLoadingStories(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const story of stories) {
      for (const tag of story.tags ?? []) {
        if (tag !== "star") tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }, [stories]);

  const filteredStories = useMemo(() => {
    if (tagFilter === "all") return stories;
    return stories.filter((story) => story.tags?.includes(tagFilter));
  }, [stories, tagFilter]);

  function resetForm() {
    setQuestion("");
    setStar(EMPTY_STAR);
    setCompetencyTag("");
    setEditingId(null);
    setAiPhase("IDLE");
    setSavePhase("IDLE");
    setPolishError(null);
    setDraftBadge(null);
    originalStarRef.current = null;
    setHasOriginalDraft(false);
    dirtyRef.current = false;
  }

  function loadStoryIntoForm(story: StarStory) {
    setEditingId(story.id);
    setQuestion(story.question_text);
    setStar(parseSavedStarAnswer(story.answer_text));
    const extraTag = story.tags?.find((t) => t !== "star") ?? "";
    setCompetencyTag(extraTag);
    dirtyRef.current = false;
    setSavePhase("IDLE");
  }

  function handleBack() {
    if (polishing || saving) {
      toast.message("Please wait until saving or AI rewrite finishes.");
      return;
    }
    if (dirtyRef.current && hasContent && savePhase !== "SAVED") {
      const leave = window.confirm(
        "You have unsaved STAR changes. Leave without saving?",
      );
      if (!leave) return;
    }
    navigate(backHref);
  }

  async function handlePolish() {
    if (!hasContent) {
      toast.error("Write something in the STAR fields first.");
      return;
    }
    if (polishing || polishInFlightRef.current) return;

    const gate = evaluateActionCreditGate({
      operationKey: "star_builder",
      balance: credits.balance,
      balanceKnown: true,
    });
    if (gate.status === "insufficient" || gate.status === "unknown_balance") {
      setCreditDenied(true);
      openUpgradeIfInsufficientCredits(
        new ApiClientError({
          message: "Not enough credits for AI rewrite.",
          status: 402,
          code: "INSUFFICIENT_CREDITS",
        }),
      );
      return;
    }

    polishInFlightRef.current = true;
    // Preserve original before any AI overwrite.
    originalStarRef.current = { ...star };
    setHasOriginalDraft(true);
    setAiPhase("GENERATING");
    setPolishError(null);
    setDraftBadge(null);
    setCreditDenied(false);

    const input = `Question: ${question || "(general behavioral)"}\n\nSituation: ${star.situation}\nTask: ${star.task}\nAction: ${star.action}\nResult: ${star.result}`;
    const contentHash = await sha256(input);
    const idempotencyKey =
      polishKeyRef.current ??
      prepToolContentIdempotencyKey("star_method", contentHash);
    polishKeyRef.current = idempotencyKey;

    try {

      const data = await fetchEdgeJson<Record<string, unknown>>("prep-tool", withPrepToolContext({
        tool_id: "star_method",
        input,
      }), {
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
      });

      const meta = parsePrepToolMeta(data);
      const text = typeof data?.result === "string" ? data.result.trim() : "";
      if (!text) {
        setStar(originalStarRef.current);
        setAiPhase("GENERATION_FAILED");
        setPolishError(AI_REWRITE_UNAVAILABLE);
        toast.error(AI_REWRITE_UNAVAILABLE);
        await refreshCredits().catch(() => undefined);
        return;
      }

      const parts = parseStarResponse(text);
      const hasParsed =
        Boolean(parts.situation?.trim()) ||
        Boolean(parts.task?.trim()) ||
        Boolean(parts.action?.trim()) ||
        Boolean(parts.result?.trim());
      if (!hasParsed) {
        setStar(originalStarRef.current);
        setAiPhase("GENERATION_FAILED");
        setPolishError(AI_REWRITE_UNAVAILABLE);
        toast.error(AI_REWRITE_UNAVAILABLE);
        await refreshCredits().catch(() => undefined);
        return;
      }

      const next: StarFields = {
        situation: parts.situation || star.situation,
        task: parts.task || star.task,
        action: parts.action || star.action,
        result: parts.result || star.result,
      };
      const factual = assessStarFactualIntegrity(input, starSectionsToText(next));
      if (!factual.ok) {
        setStar(originalStarRef.current);
        setAiPhase("GENERATION_FAILED");
        setPolishError(AI_REWRITE_UNAVAILABLE);
        toast.error(AI_REWRITE_UNAVAILABLE);
        await refreshCredits().catch(() => undefined);
        return;
      }

      setStar(next);
      dirtyRef.current = true;
      setAiPhase("GENERATED");
      setDraftBadge(prepDraftBadgeLabel(meta));
      polishKeyRef.current = null;
      if (isInputBasedPrepDraft(meta)) {
        toast.success("Draft ready (AI polish unavailable).");
      } else {
        toast.success("Answer polished. Save to keep it.");
      }
      await refreshCredits().catch(() => undefined);
    } catch (err) {
      if (originalStarRef.current) setStar(originalStarRef.current);
      if (isInsufficientCreditsError(err)) {
        setCreditDenied(true);
      }
      openUpgradeIfInsufficientCredits(err);
      const message = isAiProviderUnavailableError(err)
        ? AI_REWRITE_UNAVAILABLE
        : getAiUserFacingError(err);
      setAiPhase("GENERATION_FAILED");
      setPolishError(message);
      toast.error(message);
      await refreshCredits().catch(() => undefined);
    } finally {
      polishInFlightRef.current = false;
    }
  }

  function rejectAiDraft() {
    if (originalStarRef.current) {
      setStar(originalStarRef.current);
      originalStarRef.current = null;
      setHasOriginalDraft(false);
      setAiPhase("IDLE");
      setPolishError(null);
      setDraftBadge(null);
      toast.message("Restored your original STAR content.");
    }
  }

  async function handleSave() {
    if (!user?.id || !hasContent) return;
    if (saving) return;
    setSavePhase("SAVING");
    try {
      const answerText = buildStarAnswerText(star);
      const tags = ["star", ...(competencyTag.trim() ? [competencyTag.trim().toLowerCase()] : [])];

      if (editingId) {
        await answerBankDB.update(user.id, editingId, {
          question_text: question || "Behavioral question",
          answer_text: answerText,
          tags,
        });
        toast.success("Story updated!");
      } else {
        await answerBankDB.create(user.id, {
          question_text: question || "Behavioral question",
          answer_text: answerText,
          category: "Behavioural",
          source: "prep_lab",
          tags,
        });
        toast.success("Saved to STAR library!");
      }

      dirtyRef.current = false;
      setSavePhase("SAVED");
      resetForm();
      await loadStories();
    } catch {
      setSavePhase("SAVE_FAILED");
      toast.error(SAVE_FAILED_MSG);
    }
  }

  async function handleDelete() {
    if (!user?.id || !deleteId) return;
    setDeleting(true);
    try {
      await answerBankDB.delete(user.id, deleteId);
      if (editingId === deleteId) resetForm();
      toast.success("Story deleted.");
      setDeleteId(null);
      await loadStories();
    } catch {
      toast.error("Failed to delete story.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="STAR Builder"
        description="Structure behavioral answers using the STAR framework"
        icon={<Star className="w-5 h-5 text-amber-400" />}
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          ...(returnTo === "/app/plan"
            ? [{ label: "Practice plan", href: "/app/plan" }]
            : [{ label: PRODUCT_NAMES.prepLab, href: "/app/prep" }]),
          { label: "STAR Builder" },
        ]}
      />

      <div className="mb-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {returnTo === "/app/plan" ? "Back to practice plan" : "Back"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <PrepToolShell
            title="Build a STAR story"
            description="Fill the sections, then polish with AI when ready."
            isGenerating={polishing}
            generationLabel="Polishing STAR answer…"
            generationStage="star_polish"
            error={polishError}
            onRetry={() => void handlePolish()}
          >
          <StarBuilderForm
            question={question}
            onQuestionChange={(value) => {
              dirtyRef.current = true;
              setQuestion(value);
              setSavePhase("IDLE");
            }}
            star={star}
            onStarChange={(key, value) => {
              dirtyRef.current = true;
              setStar((prev) => ({ ...prev, [key]: value }));
              setSavePhase("IDLE");
            }}
            competencyTag={competencyTag}
            onCompetencyTagChange={(value) => {
              dirtyRef.current = true;
              setCompetencyTag(value);
              setSavePhase("IDLE");
            }}
            layout="stack"
            questionPlaceholder="e.g. Tell me about a time you led a team..."
            draftBadge={draftBadge}
          />

          <div className="flex gap-2 flex-wrap items-center">
            {creditDenied && (
              <div className="w-full">
                <InsufficientCreditsAction
                  operationKey="star_builder"
                  required={AI_CREDIT_COSTS.star_builder}
                  balance={credits.balance}
                  mode="credits"
                  returnTo="/app/prep/star-builder"
                  compact
                />
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => void handlePolish()}
              disabled={polishing || !hasContent || !credits.canAfford("star_generate")}
              leftIcon={polishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {polishing
                ? "Rewriting..."
                : `AI Rewrite (${AI_CREDIT_COSTS.star_builder} credits)`}
            </Button>
            {aiPhase === "GENERATED" && hasOriginalDraft && (
              <Button variant="ghost" size="sm" onClick={rejectAiDraft}>
                Restore original
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void handleSave()}
              disabled={saving || !hasContent}
              leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            >
              {savePhase === "SAVE_FAILED"
                ? "Retry save"
                : saving
                  ? "Saving…"
                  : editingId
                    ? "Update story"
                    : "Save to library"}
            </Button>
            {savePhase === "SAVED" && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
            )}
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>
          {savePhase === "SAVE_FAILED" && (
            <p className="text-sm text-amber-400">{SAVE_FAILED_MSG}</p>
          )}
          </PrepToolShell>

          <Card>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                STAR Library
              </h3>
              {allTags.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="text-xs rounded-lg border border-border bg-background px-2 py-1 text-foreground"
                  >
                    <option value="all">All tags</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {loadingStories ? (
              <p className="text-xs text-muted-foreground">Loading saved stories…</p>
            ) : filteredStories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No saved stories yet. Complete the form above and save to build your library.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredStories.map((story) => {
                  const tags = (story.tags ?? []).filter((t) => t !== "star");
                  return (
                    <div
                      key={story.id}
                      className={cn(
                        "p-3 rounded-xl border border-border",
                        editingId === story.id && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <p className="text-sm font-medium text-foreground line-clamp-2">
                        {story.question_text}
                      </p>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-md text-[10px] bg-secondary text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          type="button"
                          onClick={() => loadStoryIntoForm(story)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(story.id)}
                          className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 ml-2"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              Example Questions
            </h3>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuestion(ex)}
                  className={cn(
                    "w-full text-left text-xs p-2.5 rounded-lg border border-border",
                    "hover:bg-accent/10 hover:border-primary/30 transition-all",
                    "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {ex}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tips</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Be specific — avoid vague generalities.</li>
              <li>Focus on YOUR actions, not the team&apos;s.</li>
              <li>Quantify results when possible (%, $, time).</li>
              <li>Keep each section 2-4 sentences.</li>
              <li>Use AI Polish to refine your language.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete story?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently remove the story from your STAR library.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            loading={deleting}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
