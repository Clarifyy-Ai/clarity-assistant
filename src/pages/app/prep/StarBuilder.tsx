import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { answerBankDB } from "@/lib/supabase/database";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/api/functions";
import {
  getAiUserFacingError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
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
import {
  Star, Sparkles, Save, Loader2, BookOpen, Trash2, Pencil, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

const EXAMPLES = [
  "Tell me about a time you led a team through a difficult project.",
  "Describe a situation where you had to deal with a tight deadline.",
  "Give an example of how you resolved a conflict at work.",
  "Tell me about a time you failed and what you learned.",
];

type StarStory = Tables<"answer_bank">;

const EMPTY_STAR: StarFields = { situation: "", task: "", action: "", result: "" };

export default function StarBuilder() {
  const { user } = useAuthStore();

  const [question, setQuestion] = useState("");
  const [star, setStar] = useState<StarFields>(EMPTY_STAR);
  const [competencyTag, setCompetencyTag] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);

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
  }

  function loadStoryIntoForm(story: StarStory) {
    setEditingId(story.id);
    setQuestion(story.question_text);
    setStar(parseSavedStarAnswer(story.answer_text));
    const extraTag = story.tags?.find((t) => t !== "star") ?? "";
    setCompetencyTag(extraTag);
  }

  async function handlePolish() {
    if (!hasContent) {
      toast.error("Write something in the STAR fields first.");
      return;
    }

    setPolishing(true);
    try {
      const input = `Question: ${question || "(general behavioral)"}\n\nSituation: ${star.situation}\nTask: ${star.task}\nAction: ${star.action}\nResult: ${star.result}`;

      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "star_method",
        input,
      }, {
        headers: {
          "Idempotency-Key": createIdempotencyKey("prep-tool"),
        },
      });

      const text = data?.result ?? "";
      if (text) {
        const parts = parseStarResponse(text);
        setStar((prev) => ({
          situation: parts.situation || prev.situation,
          task: parts.task || prev.task,
          action: parts.action || prev.action,
          result: parts.result || prev.result,
        }));
        toast.success("Answer polished with AI!");
      }
      await refreshCredits();
    } catch (err) {
      openUpgradeIfInsufficientCredits(err);
      toast.error(getAiUserFacingError(err));
    } finally {
      setPolishing(false);
    }
  }

  async function handleSave() {
    if (!user?.id || !hasContent) return;
    setSaving(true);
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

      resetForm();
      await loadStories();
    } catch {
      toast.error("Failed to save answer.");
    } finally {
      setSaving(false);
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
          { label: PRODUCT_NAMES.prepLab, href: "/app/prep" },
          { label: "STAR Builder" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <StarBuilderForm
            question={question}
            onQuestionChange={setQuestion}
            star={star}
            onStarChange={(key, value) => setStar((prev) => ({ ...prev, [key]: value }))}
            competencyTag={competencyTag}
            onCompetencyTagChange={setCompetencyTag}
            layout="stack"
            questionPlaceholder="e.g. Tell me about a time you led a team..."
          />

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={() => void handlePolish()}
              disabled={polishing || !hasContent}
              leftIcon={polishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {polishing ? "Polishing..." : `AI Polish (${AI_CREDIT_COSTS.polish_star} credits)`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleSave()}
              disabled={saving || !hasContent}
              leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            >
              {editingId ? "Update story" : "Save to library"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>

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
