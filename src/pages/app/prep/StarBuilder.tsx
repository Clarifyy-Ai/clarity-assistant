import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { answerBankDB } from "@/lib/supabase/database";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
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

function parseSavedStarAnswer(text: string) {
  const extract = (label: string) => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n\\*\\*|$)`, "i");
    const match = text.match(re);
    return match?.[1]?.trim() ?? "";
  };
  return {
    situation: extract("Situation"),
    task: extract("Task"),
    action: extract("Action"),
    result: extract("Result"),
  };
}

function buildStarAnswerText(parts: {
  situation: string;
  task: string;
  action: string;
  result: string;
}) {
  return `**Situation:** ${parts.situation}\n\n**Task:** ${parts.task}\n\n**Action:** ${parts.action}\n\n**Result:** ${parts.result}`;
}

export default function StarBuilder() {
  const { user } = useAuthStore();

  const [question, setQuestion] = useState("");
  const [situation, setSituation] = useState("");
  const [task, setTask] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [competencyTag, setCompetencyTag] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [stories, setStories] = useState<StarStory[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasContent = situation || task || action || result;

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
    setSituation("");
    setTask("");
    setAction("");
    setResult("");
    setCompetencyTag("");
    setEditingId(null);
  }

  function loadStoryIntoForm(story: StarStory) {
    setEditingId(story.id);
    setQuestion(story.question_text);
    const parts = parseSavedStarAnswer(story.answer_text);
    setSituation(parts.situation);
    setTask(parts.task);
    setAction(parts.action);
    setResult(parts.result);
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
      const input = `Question: ${question || "(general behavioral)"}\n\nSituation: ${situation}\nTask: ${task}\nAction: ${action}\nResult: ${result}`;

      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "star_method",
        input,
      });

      const text = data?.result ?? "";
      if (text) {
        const parts = parseSTAR(text);
        if (parts.situation) setSituation(parts.situation);
        if (parts.task) setTask(parts.task);
        if (parts.action) setAction(parts.action);
        if (parts.result) setResult(parts.result);
        toast.success("Answer polished with AI!");
      }
      await refreshCredits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI polish failed.");
    } finally {
      setPolishing(false);
    }
  }

  async function handleSave() {
    if (!user?.id || !hasContent) return;
    setSaving(true);
    try {
      const answerText = buildStarAnswerText({ situation, task, action, result });
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
          { label: "Prep Lab", href: "/app/prep" },
          { label: "STAR Builder" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Interview Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Tell me about a time you led a team..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Card>

          {(["Situation", "Task", "Action", "Result"] as const).map((label) => {
            const val = { Situation: situation, Task: task, Action: action, Result: result }[label];
            const setter = { Situation: setSituation, Task: setTask, Action: setAction, Result: setResult }[label];
            const hints: Record<string, string> = {
              Situation: "Describe the context — where, when, and what was happening.",
              Task: "What was your specific responsibility or challenge?",
              Action: "What steps did you personally take?",
              Result: "What was the outcome? Quantify if possible.",
            };
            return (
              <Card key={label}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                    {label[0]}
                  </span>
                  <label className="text-sm font-medium text-foreground">{label}</label>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{hints[label]}</p>
                <textarea
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  rows={3}
                  placeholder={`Write your ${label.toLowerCase()} here...`}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </Card>
            );
          })}

          <Card>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Competency tag (optional)
            </label>
            <input
              type="text"
              value={competencyTag}
              onChange={(e) => setCompetencyTag(e.target.value)}
              placeholder="e.g. leadership, conflict-resolution"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Card>

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

function parseSTAR(text: string) {
  const out = { situation: "", task: "", action: "", result: "" };
  const lower = text.toLowerCase();

  const sIdx = lower.indexOf("situation");
  const tIdx = lower.indexOf("task");
  const aIdx = lower.indexOf("action");
  const rIdx = lower.indexOf("result");

  function extract(start: number, end: number) {
    if (start < 0) return "";
    const raw = text.slice(start, end > 0 ? end : undefined);
    return raw.replace(/^[^:]*:\s*/i, "").trim();
  }

  out.situation = extract(sIdx, tIdx);
  out.task = extract(tIdx, aIdx);
  out.action = extract(aIdx, rIdx);
  out.result = extract(rIdx, -1);

  return out;
}
