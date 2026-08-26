import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { questionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Plus, Save, Eye, ListChecks, Loader2, Trash2, Search, ArrowLeft, CheckCircle2, ShieldCheck,
} from "lucide-react";
import BlockEditor from "@/components/admin/BlockEditor";
import BlockRenderer from "@/components/admin/BlockRenderer";
import {
  type Block, ensureBlocks, blocksToPlainText, makeTextBlock, newId,
} from "@/components/admin/blocks";
import { QUESTION_EXAM_TYPE_OPTIONS } from "@/lib/mock-test/examTypes";
import { ASSESSMENT_ROLE_SLUGS, REVIEW_STATUSES } from "@/lib/assessments/taxonomy";
import { validateQuestionQuality } from "@/lib/assessments/questionQuality";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";

const EXAMS = [...QUESTION_EXAM_TYPE_OPTIONS];
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

interface QuestionRow {
  id: string;
  question_text: string;
  question_blocks: Block[] | null;
  option_blocks: Record<string, Block[]> | null;
  explanation_blocks: Block[] | null;
  options: any;
  correct_answer: string;
  subject: string;
  topic: string;
  subtopic: string | null;
  difficulty: string | null;
  exam_type: string | null;
  source_year: number | null;
  is_verified: boolean;
  is_public: boolean;
  marks_positive: number;
  marks_negative: number;
  created_at: string;
}

export default function AdminQuestionEditor() {
  const { id } = useParams<{ id?: string }>();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  if (!isAdmin) {
    return <ListView />;
  }

  return id === "new" || id ? <EditorView id={id} /> : <ListView />;
}

// ─────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────

function ListView() {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => { void load(); }, [search, examFilter]);

  async function load() {
    setLoading(true);
    try {
      const data = await questionsDB.list({
        examType: examFilter,
        search: search || undefined,
        limit: 100,
      });
      setRows(data as unknown as QuestionRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await questionsDB.delete(deleteId);
      void writeAdminAudit({
        action: "question_delete",
        targetType: "question",
        targetId: deleteId,
      });
      toast.success("Deleted");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  async function verifyQuestion(row: QuestionRow) {
    setActionBusyId(row.id);
    try {
      await questionsDB.update(row.id, {
        is_verified: true,
        review_status: "approved",
      });
      void writeAdminAudit({
        action: "verify",
        targetType: "question",
        targetId: row.id,
        newValue: { is_verified: true, review_status: "approved" },
      });
      toast.success("Question verified");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setActionBusyId(null);
    }
  }

  async function approvePublish(row: QuestionRow) {
    setActionBusyId(row.id);
    try {
      await questionsDB.update(row.id, {
        is_verified: true,
        is_public: true,
        review_status: "approved",
        publish_status: "published",
      });
      void writeAdminAudit({
        action: "publish",
        targetType: "question",
        targetId: row.id,
        newValue: {
          is_verified: true,
          is_public: true,
          review_status: "approved",
          publish_status: "published",
        },
      });
      toast.success("Question approved and published");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="space-y-5 max-w-7xl pb-20">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader
          title="Question Bank Editor"
          description="Author, edit, and manage every question — with images placed anywhere inside the question."
        />
        {isAdmin && (
        <Button
          onClick={() => navigate("/app/admin/questions/new")}
          leftIcon={<Plus className="w-4 h-4" />}
          className="bg-primary hover:bg-primary/90 text-white"
        >
          New question
        </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Input
            placeholder="Search question text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            className="sm:w-72"
            fullWidth={false}
          />
          <Select value={examFilter} onValueChange={setExamFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exams</SelectItem>
              {EXAMS.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No questions match. Click <strong>New question</strong> to add one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Question", "Exam", "Subject", "Difficulty", "Status", "Actions"].map((h) => (
                    <th key={h} scope="col" className="text-left text-[10px] uppercase tracking-widest text-muted-foreground px-4 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/admin/questions/${r.id}`)}
                  >
                    <td className="px-4 py-3 max-w-md">
                      <p className="text-foreground line-clamp-2">{r.question_text}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.exam_type ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.subject}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.difficulty ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.is_verified && <Badge variant="primary" size="sm">Verified</Badge>}
                        {r.is_public && <Badge size="sm">Public</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {!r.is_verified && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={actionBusyId === r.id}
                            onClick={() => void verifyQuestion(r)}
                            leftIcon={<ShieldCheck className="w-3 h-3" />}
                          >
                            Verify
                          </Button>
                        )}
                        {!(r.is_verified && r.is_public) && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={actionBusyId === r.id}
                            onClick={() => void approvePublish(r)}
                            leftIcon={<CheckCircle2 className="w-3 h-3" />}
                          >
                            Approve
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteId(r.id)}
                          className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                          aria-label="Delete question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete this question?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EDITOR
// ─────────────────────────────────────────────────────────────────

interface EditorState {
  qBlocks: Block[];
  optionBlocks: Record<string, Block[]>;
  explanationBlocks: Block[];
  correct: "A" | "B" | "C" | "D";
  subject: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  examType: string;
  sourceYear: string;
  marksPositive: number;
  marksNegative: number;
  isVerified: boolean;
  isPublic: boolean;
  category: string;
  eligibleRoles: string[];
  crossFunctional: boolean;
  reviewStatus: string;
}

function makeEmpty(): EditorState {
  return {
    qBlocks: [makeTextBlock("")],
    optionBlocks: { A: [makeTextBlock("")], B: [makeTextBlock("")], C: [makeTextBlock("")], D: [makeTextBlock("")] },
    explanationBlocks: [makeTextBlock("")],
    correct: "A",
    subject: "",
    topic: "",
    subtopic: "",
    difficulty: "MEDIUM",
    examType: "JEE Main",
    sourceYear: String(new Date().getFullYear()),
    marksPositive: 4,
    marksNegative: 1,
    isVerified: false,
    isPublic: false,
    category: "",
    eligibleRoles: [],
    crossFunctional: false,
    reviewStatus: "review_required",
  };
}

function EditorView({ id }: { id?: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isNew = id === "new";

  const [state, setState] = useState<EditorState>(makeEmpty());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const folderId = useMemo(() => (isNew ? `draft-${newId().slice(0, 8)}` : id!), [id, isNew]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      setLoading(true);
      try {
        const data = await questionsDB.getById(id!);
        if (!data) {
          toast.error("Question not found");
          navigate("/app/admin/questions");
          return;
        }
        const r = data;
        const optsRaw: Record<string, unknown> =
          (r.options as Record<string, unknown>) ?? {};
        const optionBlocks: Record<string, Block[]> = {};
        for (const L of OPTION_LETTERS) {
          optionBlocks[L] = ensureBlocks(
            (r.option_blocks as unknown as Record<string, Block[] | undefined> | null)?.[L],
            typeof optsRaw === "object" ? String(optsRaw[L] ?? "") : "",
          );
        }
        setState({
          qBlocks: ensureBlocks(r.question_blocks as unknown as Block[] | null, r.question_text),
          optionBlocks,
          explanationBlocks: ensureBlocks(
            r.explanation_blocks as unknown as Block[] | null,
            r.explanation,
          ),
          correct: (r.correct_answer ?? "A") as "A",
          subject: r.subject ?? "",
          topic: r.topic ?? "",
          subtopic: r.subtopic ?? "",
          difficulty: r.difficulty ?? "MEDIUM",
          examType: r.exam_type ?? "JEE Main",
          sourceYear: String(r.source_year ?? new Date().getFullYear()),
          marksPositive: Number(r.marks_positive ?? 4),
          marksNegative: Number(r.marks_negative ?? 1),
          isVerified: !!r.is_verified,
          isPublic: !!r.is_public,
          category: (r as { category?: string | null }).category ?? r.subject ?? "",
          eligibleRoles: ((r as { eligible_roles?: string[] | null }).eligible_roles ?? []) as string[],
          crossFunctional: Boolean((r as { cross_functional?: boolean | null }).cross_functional),
          reviewStatus: (r as { review_status?: string | null }).review_status ?? "unreviewed",
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load question");
        navigate("/app/admin/questions");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, navigate]);

  async function persistQuestion(
    next: EditorState,
    auditAction: "question_create" | "question_edit" | "verify" | "publish",
  ) {
    if (!user?.id) {
      toast.error("Not authenticated");
      return false;
    }
    if (!next.subject.trim() || !next.topic.trim()) {
      toast.error("Subject and topic are required.");
      return false;
    }
    if (blocksToPlainText(next.qBlocks).length < 3) {
      toast.error("Question body cannot be empty.");
      return false;
    }
    if (!blocksToPlainText(next.explanationBlocks).trim()) {
      toast.error("Explanation is required.");
      return false;
    }

    setSaving(true);
    try {
      const optionsPlain: Array<{ label: string; text: string }> = [];
      for (const L of OPTION_LETTERS) {
        const option = blocksToPlainText(next.optionBlocks[L]).trim();
        if (!option) {
          toast.error(`Option ${L} is required.`);
          return false;
        }
        optionsPlain.push({ label: L, text: option });
      }

      const approved = next.reviewStatus === "approved";
      const payload: Record<string, unknown> = {
        question_text: blocksToPlainText(next.qBlocks),
        question_blocks: next.qBlocks,
        option_blocks: next.optionBlocks,
        explanation_blocks: next.explanationBlocks,
        options: optionsPlain,
        correct_answer: next.correct,
        explanation: blocksToPlainText(next.explanationBlocks),
        subject: next.subject.trim(),
        topic: next.topic.trim(),
        subtopic: next.subtopic.trim() || null,
        difficulty: next.difficulty,
        exam_type: next.examType,
        source_year: Number(next.sourceYear) || null,
        marks_positive: next.marksPositive,
        marks_negative: next.marksNegative,
        is_verified: approved && next.isVerified,
        is_public: approved && next.isPublic,
        publish_status: approved && next.isPublic ? "published" : "draft",
        source: "USER_UPLOAD",
        source_type: "admin_uploaded",
        license_type: "INTERNAL",
        validation_status: "valid",
        question_type: "MCQ",
        uploaded_by: user.id,
        category: next.category.trim() || next.subject.trim(),
        eligible_roles: next.eligibleRoles,
        cross_functional: next.crossFunctional,
        review_status: next.reviewStatus,
      };
      const validationIssues = validateQuestionQuality(payload);
      if (validationIssues.length > 0) {
        toast.error(validationIssues[0].message);
        return false;
      }

      if (isNew) {
        const { id: newId } = await questionsDB.create(payload as never);
        void writeAdminAudit({
          action: auditAction === "question_create" ? "question_create" : auditAction,
          targetType: "question",
          targetId: newId,
          newValue: payload,
        });
        toast.success(
          auditAction === "publish"
            ? "Question approved and published"
            : auditAction === "verify"
              ? "Question verified"
              : "Question created",
        );
        navigate(`/app/admin/questions/${newId}`);
      } else {
        await questionsDB.update(id!, payload as never);
        void writeAdminAudit({
          action: auditAction === "question_edit" ? "question_edit" : auditAction,
          targetType: "question",
          targetId: id!,
          newValue: {
            is_verified: payload.is_verified,
            is_public: payload.is_public,
            review_status: payload.review_status,
            publish_status: payload.publish_status,
          },
        });
        toast.success(
          auditAction === "publish"
            ? "Question approved and published"
            : auditAction === "verify"
              ? "Question verified"
              : "Saved",
        );
      }
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await persistQuestion(state, isNew ? "question_create" : "question_edit");
  }

  async function handleVerify() {
    const next: EditorState = {
      ...state,
      isVerified: true,
      reviewStatus: "approved",
    };
    setState(next);
    await persistQuestion(next, "verify");
  }

  async function handleApprovePublish() {
    const next: EditorState = {
      ...state,
      isVerified: true,
      isPublic: true,
      reviewStatus: "approved",
    };
    setState(next);
    await persistQuestion(next, "publish");
  }

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading question…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/admin/questions")} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back
          </Button>
          <PageHeader
            title={isNew ? "New question" : "Edit question"}
            description="Add text, images, and formulas anywhere in the question or its options."
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && !state.isVerified && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void handleVerify()}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Verify
            </Button>
          )}
          {isAdmin && !(state.isVerified && state.isPublic) && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void handleApprovePublish()}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Approve &amp; Publish
            </Button>
          )}
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            loading={saving}
            leftIcon={<Save className="w-4 h-4" />}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            Save question
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit"><ListChecks className="w-3.5 h-3.5 mr-1.5" /> Edit</TabsTrigger>
              <TabsTrigger value="preview"><Eye className="w-3.5 h-3.5 mr-1.5" /> Student preview</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-5 mt-4">
              <SectionCard title="Question body" subtitle="Drop images between paragraphs to place them mid-question.">
                <BlockEditor
                  value={state.qBlocks}
                  onChange={(qBlocks) => setState((s) => ({ ...s, qBlocks }))}
                  uploadFolder={`question/${folderId}`}
                />
              </SectionCard>

              <SectionCard title="Options" subtitle="Each option supports inline images too (great for diagram-based answers).">
                <div className="space-y-4">
                  {OPTION_LETTERS.map((L) => (
                    <div key={L} className="border border-border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary/15 text-primary font-bold text-sm flex items-center justify-center">{L}</span>
                          <span className="text-sm font-semibold">Option {L}</span>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="radio"
                            checked={state.correct === L}
                            onChange={() => setState((s) => ({ ...s, correct: L }))}
                          />
                          Correct answer
                        </label>
                      </div>
                      <BlockEditor
                        value={state.optionBlocks[L]}
                        onChange={(blocks) =>
                          setState((s) => ({
                            ...s,
                            optionBlocks: { ...s.optionBlocks, [L]: blocks },
                          }))
                        }
                        uploadFolder={`option/${folderId}/${L}`}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Explanation" subtitle="Shown to the student after they submit.">
                <BlockEditor
                  value={state.explanationBlocks}
                  onChange={(explanationBlocks) => setState((s) => ({ ...s, explanationBlocks }))}
                  uploadFolder={`explanation/${folderId}`}
                />
              </SectionCard>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Question</p>
                    <BlockRenderer blocks={state.qBlocks} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Options</p>
                    {OPTION_LETTERS.map((L) => (
                      <div
                        key={L}
                        className={`p-3 rounded-xl border ${state.correct === L ? "border-emerald-500/50 bg-emerald-500/5" : "border-border"}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-muted text-xs font-bold flex items-center justify-center shrink-0">{L}</span>
                          <div className="flex-1"><BlockRenderer blocks={state.optionBlocks[L]} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Explanation</p>
                    <BlockRenderer blocks={state.explanationBlocks} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: metadata */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-bold">Metadata</h3>
              <Field label="Subject *">
                <Input value={state.subject} onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))} placeholder="Quant" />
              </Field>
              <Field label="Topic *">
                <Input value={state.topic} onChange={(e) => setState((s) => ({ ...s, topic: e.target.value }))} placeholder="Algebra" />
              </Field>
              <Field label="Subtopic">
                <Input value={state.subtopic} onChange={(e) => setState((s) => ({ ...s, subtopic: e.target.value }))} placeholder="Quadratic equations" />
              </Field>
              <Field label="Exam">
                <Select value={state.examType} onValueChange={(v) => setState((s) => ({ ...s, examType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXAMS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Difficulty">
                <Select value={state.difficulty} onValueChange={(v) => setState((s) => ({ ...s, difficulty: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Source year">
                <Input type="number" value={state.sourceYear} onChange={(e) => setState((s) => ({ ...s, sourceYear: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="+ marks">
                  <Input type="number" value={state.marksPositive} onChange={(e) => setState((s) => ({ ...s, marksPositive: Number(e.target.value) || 0 }))} />
                </Field>
                <Field label="− marks">
                  <Input type="number" value={state.marksNegative} onChange={(e) => setState((s) => ({ ...s, marksNegative: Number(e.target.value) || 0 }))} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.isVerified}
                  onChange={(e) => setState((s) => ({ ...s, isVerified: e.target.checked }))}
                />
                Verified (admin-approved)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.isPublic}
                  onChange={(e) => setState((s) => ({ ...s, isPublic: e.target.checked }))}
                />
                Public (visible to all students)
              </label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Use <strong>Verify</strong> or <strong>Approve &amp; Publish</strong> above to set review status and persist lifecycle flags. Publication requires verified + approved status.
              </p>
              <Field label="Category">
                <Input value={state.category} onChange={(e) => setState((s) => ({ ...s, category: e.target.value }))} placeholder="Backend" />
              </Field>
              <Field label="Review status">
                <Select value={state.reviewStatus} onValueChange={(v) => setState((s) => ({ ...s, reviewStatus: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REVIEW_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.crossFunctional}
                  onChange={(e) => setState((s) => ({ ...s, crossFunctional: e.target.checked }))}
                />
                Cross-functional
              </label>
              <fieldset className="space-y-1">
                <legend className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Assessment eligibility</legend>
                {ASSESSMENT_ROLE_SLUGS.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.eligibleRoles.includes(role)}
                      onChange={(e) => setState((s) => ({
                        ...s,
                        eligibleRoles: e.target.checked
                          ? [...s.eligibleRoles, role]
                          : s.eligibleRoles.filter((item) => item !== role),
                      }))}
                    />
                    {role}
                  </label>
                ))}
              </fieldset>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</label>
      {children}
    </div>
  );
}
