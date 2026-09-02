import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { answerBankDB, practiceContextsDB } from "@/lib/supabase/database";
import type { Tables } from "@/integrations/supabase";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { toast } from "sonner";
import {
  BookOpen, Search, Star, Trash2,
  ChevronDown, ChevronUp, Copy,
  Edit2, Check, Plus, Sparkles, ExternalLink, Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { parsePrepToolResponse } from "@/lib/network/edgeResult";
import {
  prepToolContentIdempotencyKey,
} from "@/lib/network/idempotency";
import { sha256 } from "@/lib/utils/hashUtils";
import {
  getAiUserFacingError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useCredits, type CreditAction } from "@/hooks/useCredits";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  answerBankEmptyTitle,
  answerBankLoadErrorMessage,
  userFacingDbError,
} from "@/lib/errors/userFacingDbError";
import {
  draftFromAnswerBankEntry,
  practiceContextLaunchPath,
} from "@/lib/session/practiceContext";

// ─────────────────────────────────────────────────────────────────
// AnswerBank — saved STAR answers + session saves (Knowledge Base)
// ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Behavioural", "Technical", "Leadership", "System Design", "HR"];
const MAX_ANSWER_LENGTH = 5000;

type LoadPhase = "IDLE" | "LOADING" | "SUCCESS" | "EMPTY" | "ERROR";

function safeLower(value: string | null | undefined): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function safeCategory(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

function formatCreatedAt(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return format(d, "MMM d, yyyy");
  } catch {
    return "";
  }
}

function validateAnswer(question: string, answer: string, existingAnswers: string[]): string | null {
  const normalized = answer.trim().toLowerCase().replace(/\s+/g, " ");
  if (question.trim().length < 5) return "Enter a question of at least 5 characters.";
  if (answer.trim().length < 10) return "Your answer must be at least 10 characters.";
  if (answer.length > MAX_ANSWER_LENGTH) return `Your answer must be no more than ${MAX_ANSWER_LENGTH} characters.`;
  if (/^(.)\1{7,}$/s.test(answer.trim())) return "Please enter a meaningful answer, not repeated characters.";
  if (new Set(normalized.replace(/\s/g, "")).size < 3) return "Please enter a meaningful answer, not repeated characters.";
  if (existingAnswers.some((entry) => entry.trim().toLowerCase().replace(/\s+/g, " ") === normalized)) {
    return "This answer is already saved for your account.";
  }
  return null;
}

export default function AnswerBank() {
  const { user }  = useAuthStore();
  const navigate = useNavigate();
  const productLabel = PRODUCT_NAMES.answerBank;

  const [answers,   setAnswers]   = useState<Tables<"answer_bank">[]>([]);
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("IDLE");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search,    setSearch]    = useState("");
  const [category,  setCategory]  = useState("All");
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editText,  setEditText]  = useState("");
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [addOpen,   setAddOpen]   = useState(false);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!user?.id) return;
    void fetchAnswers();
  }, [user?.id]);

  async function fetchAnswers() {
    if (!user?.id) return;
    const gen = ++fetchGenRef.current;
    setLoadPhase("LOADING");
    setLoadError(null);
    try {
      const data = await answerBankDB.listByUserId(user.id);
      if (gen !== fetchGenRef.current) return;
      setAnswers(data);
      setLoadPhase(data.length === 0 ? "EMPTY" : "SUCCESS");
    } catch {
      if (gen !== fetchGenRef.current) return;
      const msg = answerBankLoadErrorMessage(productLabel);
      setLoadError(msg);
      setLoadPhase("ERROR");
      toast.error(msg);
    }
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      if (!user?.id) return;
      const validationError = validateAnswer(
        answers.find((entry) => entry.id === editId)?.question_text ?? "Question",
        editText,
        answers.filter((entry) => entry.id !== editId).map((entry) => entry.answer_text ?? ""),
      );
      if (validationError) {
        toast.error(validationError);
        return;
      }
      await answerBankDB.update(user.id, editId, { answer_text: editText });
      setAnswers((p) =>
        p.map((a) => a.id === editId ? { ...a, answer_text: editText } : a)
      );
      setEditId(null);
      toast.success("Answer updated");
    } catch {
      toast.error(userFacingDbError(null, "save"));
    }
  }

  async function deleteAnswer() {
    if (!deleteId || !user?.id) return;
    try {
      await answerBankDB.delete(user.id, deleteId);
      setAnswers((p) => {
        const next = p.filter((a) => a.id !== deleteId);
        setLoadPhase(next.length === 0 ? "EMPTY" : "SUCCESS");
        return next;
      });
      setDeleteId(null);
      toast.success("Answer deleted");
    } catch {
      toast.error(userFacingDbError(null, "delete"));
    }
  }

  const filtered = useMemo(() => {
    const q = safeLower(search.trim());
    return answers.filter((a) => {
      const rowCategory = safeCategory(a.category);
      if (category !== "All" && rowCategory !== category) return false;
      if (!q) return true;
      return (
        safeLower(a.question_text).includes(q) ||
        safeLower(a.answer_text).includes(q)
      );
    });
  }, [answers, category, search]);

  const loading = loadPhase === "LOADING" || loadPhase === "IDLE";
  const showEmpty =
    !loading &&
    loadPhase !== "ERROR" &&
    filtered.length === 0 &&
    answers.length === 0;
  const showNoResults =
    !loading &&
    loadPhase !== "ERROR" &&
    filtered.length === 0 &&
    answers.length > 0;

  return (
    <div className="space-y-5 max-w-4xl">
      {loadError && loadPhase === "ERROR" && (
        <InlineErrorRetry message={loadError} onRetry={() => void fetchAnswers()} />
      )}

      <PageHeader
        title={productLabel}
        description="Your saved STAR answers and best responses"
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: productLabel },
        ]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddOpen(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Answer
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search answers…"
          aria-label="Search answers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          fullWidth={false}
          className="sm:w-64"
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
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

      {/* Answers list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : showEmpty ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={answerBankEmptyTitle(productLabel)}
            description="Save answers from sessions or build them in Prep Lab."
            actionLabel="Add Answer"
            onAction={() => setAddOpen(true)}
          />
        </Card>
      ) : showNoResults ? (
        <Card>
          <EmptyState
            icon={Search}
            title="No matching answers"
            description="Try a different search or category filter."
            actionLabel="Clear filters"
            onAction={() => {
              setSearch("");
              setCategory("All");
            }}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((ans) => {
            const isOpen = expanded[ans.id];
            const isEditing = editId === ans.id;
            const createdLabel = formatCreatedAt(ans.created_at);

            return (
              <Card key={ans.id}>
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <Link
                    to={`/app/answers/${ans.id}`}
                    className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 hover:bg-primary/20 transition-colors"
                    aria-label="Open answer detail"
                  >
                    <Star className="w-3.5 h-3.5 text-primary" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/app/answers/${ans.id}`}
                      className="text-sm font-medium text-foreground leading-snug hover:text-primary transition-colors block"
                    >
                      {ans.question_text ?? "Untitled"}
                    </Link>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {ans.category && (
                        <Badge variant="default" size="sm">{ans.category}</Badge>
                      )}
                      {createdLabel && (
                        <span className="text-[10px] text-muted-foreground">
                          {createdLabel}
                        </span>
                      )}
                      {ans.source === "prep_lab" && (
                        <Badge variant="blue" size="sm">Prep Lab</Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!user?.id) return;
                        void (async () => {
                          try {
                            const created = await practiceContextsDB.create(
                              user.id,
                              draftFromAnswerBankEntry(ans),
                            );
                            navigate(practiceContextLaunchPath(created.id));
                          } catch {
                            toast.error("Could not start practice. Please try again.");
                          }
                        })();
                      }}
                      className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-all"
                      title="Practice this with Coach"
                      aria-label="Practice this with Coach"
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      to={`/app/answers/${ans.id}`}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                      title="Open detail"
                      aria-label="Open detail"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => navigator.clipboard.writeText(ans.answer_text ?? "")}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                      title="Copy answer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditId(ans.id);
                        setEditText(ans.answer_text ?? "");
                        setExpanded((p) => ({ ...p, [ans.id]: true }));
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(ans.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-accent/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [ans.id]: !p[ans.id] }))}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-all"
                    >
                      {isOpen
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {isEditing ? (
                      <>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={6}
                          className="w-full bg-background border border-primary/50 text-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={saveEdit}
                            leftIcon={<Check className="w-3 h-3" />}
                          >
                            Save changes
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {ans.answer_text}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete answer?" size="sm">
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete this saved answer.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" fullWidth onClick={() => void deleteAnswer()}>
            Delete
          </Button>
        </div>
      </Modal>

      {/* Add new answer modal */}
      <AddAnswerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(a) => {
          setAnswers((p) => [a, ...p]);
          setLoadPhase("SUCCESS");
          setAddOpen(false);
        }}
        userId={user?.id ?? ""}
        existingAnswers={answers.map((entry) => entry.answer_text ?? "")}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AddAnswerModal
// ─────────────────────────────────────────────────────────────────

function AddAnswerModal({
  open, onClose, onSaved, userId, existingAnswers,
}: {
  open:    boolean;
  onClose: () => void;
  onSaved: (a: Tables<"answer_bank">) => void;
  userId:  string;
  existingAnswers: string[];
}) {
  const [question, setQuestion] = useState("");
  const [answer,   setAnswer]   = useState("");
  const [category, setCategory] = useState("Behavioural");
  const [saving,   setSaving]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState(false);
  const generateInFlightRef = useRef(false);
  const generateKeyRef = useRef<string | null>(null);
  const credits = useCredits();

  async function handleGenerateWithAi() {
    if (!question.trim() || generating || generateInFlightRef.current) return;
    const cat = category.trim() || "Behavioural";
    const useStar =
      cat === "Behavioural" || cat === "Leadership" || cat === "HR";
    const creditAction: CreditAction = useStar ? "star_generate" : "rephrase";
    if (!credits.canAfford(creditAction)) {
      openUpgradeIfInsufficientCredits(
        Object.assign(new Error("Insufficient credits."), { code: "INSUFFICIENT_CREDITS" }),
      );
      return;
    }

    generateInFlightRef.current = true;
    setGenerating(true);
    try {
      const tool_id = useStar ? "star_method" : "raw_prompt";
      const input = useStar
        ? `Interview question:\n${question.trim()}\n\nCategory: ${cat}\n\nUser draft (optional):\n${answer.trim() || "(none yet)"}\n\nImprove structure into a STAR answer for THIS exact question. Only use facts from the draft. If evidence is missing, use [NEEDS EVIDENCE] or [Add measurable result if available]. Never invent employers, metrics, technologies, or outcomes.`
        : `Interview category: ${cat}\nInterview question:\n${question.trim()}\n\nUser draft (optional):\n${answer.trim() || "(none yet)"}\n\nWrite a strong interview-ready answer for this exact question. Match the category. Do NOT invent employers, metrics, or unsupported claims. Use [NEEDS EVIDENCE] where facts are missing.`;

      const contentHash = await sha256(`${tool_id}\n${input}`);
      const idempotencyKey =
        generateKeyRef.current ??
        prepToolContentIdempotencyKey(tool_id, contentHash);
      generateKeyRef.current = idempotencyKey;

      const data = await fetchEdgeJson<Record<string, unknown>>("prep-tool", {
        tool_id,
        input,
      }, {
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
        timeoutMs: 90_000,
      });
      const parsed = parsePrepToolResponse(data);
      const text = parsed.result;
      if (!text) throw new Error("AI returned an empty answer.");
      setAnswer(text.slice(0, MAX_ANSWER_LENGTH));
      setAiDraft(true);
      generateKeyRef.current = null;
      await refreshCredits().catch(() => undefined);
      const usedFallback =
        parsed.source === "deterministic" ||
        parsed.source === "fallback" ||
        parsed.source === "python";
      toast.success(
        usedFallback
          ? "Draft outline generated — review and add your real experience before saving"
          : "Draft generated — review before saving",
      );
    } catch (err) {
      generateKeyRef.current = null;
      openUpgradeIfInsufficientCredits(err);
      toast.error(getAiUserFacingError(err));
      await refreshCredits().catch(() => undefined);
    } finally {
      generateInFlightRef.current = false;
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!question.trim() || !answer.trim()) return;
    const validationError = validateAnswer(question, answer, existingAnswers);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const data = await answerBankDB.create(userId, {
        question_text: question.trim(),
        answer_text:   answer.trim(),
        category,
        source:        aiDraft ? "prep_lab" : "manual",
      });
      onSaved(data);
      setQuestion("");
      setAnswer("");
      setCategory("Behavioural");
      setAiDraft(false);
    } catch {
      toast.error(userFacingDbError(null, "save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Answer to bank" size="lg">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Question</p>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Tell me about a time you failed…"
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c !== "All").map((c) => (
              <button
                key={c}
                type="button"
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
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <p className="text-xs text-muted-foreground">Your answer</p>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              loading={generating}
              disabled={!question.trim() || generating || saving}
              onClick={() => void handleGenerateWithAi()}
              leftIcon={<Sparkles className="w-3 h-3" />}
            >
              Generate with AI
            </Button>
          </div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, MAX_ANSWER_LENGTH))}
            placeholder="Write your answer here, or generate a draft with AI…"
            rows={6}
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
          <p className="mt-1 text-xs text-muted-foreground">{answer.length}/{MAX_ANSWER_LENGTH} characters (minimum 10).</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            loading={saving}
            disabled={!question.trim() || !answer.trim() || generating}
            onClick={handleSave}
            leftIcon={<Star className="w-3.5 h-3.5" />}
          >
            Save to bank
          </Button>
        </div>
      </div>
    </Modal>
  );
}
