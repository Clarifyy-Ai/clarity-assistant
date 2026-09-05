import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, Filter, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { LICENSE_TYPES, canPublishLicense, type LicenseType } from "@/lib/content/license";
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  buildImportReport,
  formatImportReport,
  mapRawImportRow,
  parseCsvText,
  toBankInsert,
  type ImportReport,
} from "@/lib/question-bank/importQuestions";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { questionFingerprint } from "@/lib/gov-exam/validators/similarity";
import { ASSESSMENT_ROLE_SLUGS, REVIEW_STATUSES } from "@/lib/assessments/taxonomy";
import {
  assertPublishableForTrigger,
  buildQuestionPublishPatch,
} from "@/lib/question-bank/questionPublishPatch";
import { userFacingDbError } from "@/lib/errors/userFacingDbError";
import {
  mcqFieldsFromOptions,
  optionsForQuestionType,
  parseOptionText,
  trueFalseLabelFromAnswer,
} from "@/lib/question-bank/questionBankForm";
import {
  isUsableQuestionImageUrl,
  resolveQuestionImageUrl,
  uniqueImageUrls,
} from "@/lib/mock-test/questionMedia";
import {
  CodingQuestionFields,
  validateCodingQuestionFields,
  type CodingQuestionFieldValues,
} from "@/components/coding/CodingQuestionFields";
import {
  CODING_AUTO_CORRECT_ANSWER,
  codingFieldsFromMetadata,
  DEFAULT_CODING_FORM_FIELDS,
  parseQuestionCodingMetadata,
  wrapQuestionMetadata,
} from "@/lib/question-bank/codingMetadata";
import { cn } from "@/lib/utils";

type BankRow = {
  id: string;
  question_text: string;
  question_type: string;
  category: string | null;
  subject: string;
  topic: string;
  difficulty: string | null;
  tags: string[] | null;
  license_type: string | null;
  publish_status: string;
  source: string | null;
  created_at: string;
  uploaded_by: string | null;
  options: Array<{ label: string; text: string }> | null;
  correct_answer: string;
  explanation: string | null;
  image_url?: string | null;
  has_image?: boolean | null;
  metadata?: unknown;
  eligible_roles?: string[] | null;
  cross_functional?: boolean | null;
  review_status?: string | null;
};

const MCQ_OPTION_KEYS = [
  { text: "option_a", image: "option_a_image", label: "A" },
  { text: "option_b", image: "option_b_image", label: "B" },
  { text: "option_c", image: "option_c_image", label: "C" },
  { text: "option_d", image: "option_d_image", label: "D" },
] as const;

const EMPTY_FORM = {
  question_text: "",
  question_type: "MCQ",
  image_url: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  option_a_image: "",
  option_b_image: "",
  option_c_image: "",
  option_d_image: "",
  correct_answer: "A",
  category: "",
  topic: "",
  difficulty: "MEDIUM",
  explanation: "",
  tags: "",
  license_type: "USER_OWNED" as LicenseType,
  source: "USER_UPLOAD",
  eligible_roles: [] as string[],
  cross_functional: false,
  review_status: "unreviewed" as const,
  ...DEFAULT_CODING_FORM_FIELDS,
};

export default function QuestionBankPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [rows, setRows] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [license, setLicense] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<BankRow | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from("questions")
      .select(
        "id,question_text,question_type,category,subject,topic,difficulty,tags,license_type,publish_status,source,created_at,uploaded_by,options,correct_answer,explanation,image_url,has_image,metadata,eligible_roles,cross_functional,review_status",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (!isAdmin) query = query.eq("uploaded_by", user.id);
    const { data, error } = await query;
    if (error) {
      const msg = userFacingDbError(error, "load");
      setLoadError(msg);
      toast.error(msg);
      setRows([]);
    } else {
      setRows((data as BankRow[]) ?? []);
    }
    setLoading(false);
  }, [user?.id, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (q && !row.question_text.toLowerCase().includes(q.toLowerCase()) && !(row.tags ?? []).some((t) => t.toLowerCase().includes(q.toLowerCase()))) {
        return false;
      }
      if (category !== "all" && (row.category ?? row.subject) !== category) return false;
      if (difficulty !== "all" && row.difficulty !== difficulty) return false;
      if (type !== "all" && row.question_type !== type) return false;
      if (status !== "all" && row.publish_status !== status) return false;
      if (license !== "all" && row.license_type !== license) return false;
      return true;
    });
  }, [rows, q, category, difficulty, type, status, license]);

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category || r.subject).filter(Boolean))],
    [rows],
  );

  function handleQuestionTypeChange(nextType: string) {
    setForm((prev) => {
      const next = { ...prev, question_type: nextType };
      if (nextType === "TRUE_FALSE") {
        next.correct_answer = trueFalseLabelFromAnswer(prev.correct_answer);
      } else if (nextType === "MCQ") {
        next.correct_answer = ["A", "B", "C", "D"].includes(prev.correct_answer.toUpperCase())
          ? prev.correct_answer.toUpperCase()
          : "A";
      } else if (nextType === "CODING") {
        next.correct_answer = CODING_AUTO_CORRECT_ANSWER;
      }
      return next;
    });
  }

  async function saveQuestion() {
    if (!user?.id) return;
    if (!form.question_text.trim() || !form.category.trim()) {
      toast.error("Question text and category are required.");
      return;
    }
    if (!canPublishLicense(form.license_type) && editingId) {
      toast.error("UNKNOWN license content cannot be published.");
    }

    const isMcq = form.question_type === "MCQ";
    const isTrueFalse = form.question_type === "TRUE_FALSE";
    const isCoding = form.question_type === "CODING";
    const built = optionsForQuestionType({
      question_type: form.question_type,
      mcq: form,
      correct_answer: form.correct_answer,
    });

    let codingMetadataPayload: Record<string, unknown> | null = null;
    let correctAnswer = built.correct_answer;

    if (isMcq) {
      if (
        built.options.length < 2
        || !built.options.some((option) => option.label === built.correct_answer)
      ) {
        toast.error("MCQ questions need at least two options and a matching correct option.");
        return;
      }
    } else if (isTrueFalse) {
      if (!built.correct_answer) {
        toast.error("Select True or False as the correct answer.");
        return;
      }
    } else if (isCoding) {
      const codingBuilt = validateCodingQuestionFields(form as CodingQuestionFieldValues);
      if (!codingBuilt.ok) {
        toast.error((codingBuilt as { error: string }).error);
        return;
      }
      codingMetadataPayload = wrapQuestionMetadata(codingBuilt.metadata);
      correctAnswer = CODING_AUTO_CORRECT_ANSWER;
    } else if (!form.correct_answer.trim()) {
      toast.error("Enter the expected answer for this question type.");
      return;
    }

    const imageUrl = form.image_url.trim();
    const payload = {
      question_text: form.question_text.trim(),
      question_type: form.question_type,
      options: isCoding ? [] : built.options,
      correct_answer: correctAnswer,
      explanation: form.explanation || null,
      image_url: imageUrl || null,
      has_image: Boolean(imageUrl),
      metadata: codingMetadataPayload ?? {},
      subject: form.category,
      category: form.category,
      topic: form.topic || form.category,
      difficulty: form.difficulty,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      license_type: form.license_type,
      copyright_status: form.license_type,
      source: form.source,
      content_owner: user.id,
      created_by: user.id,
      uploaded_by: user.id,
      exam_type: "CLARIFY_ORIGINAL",
      is_public: false,
      publish_status: "draft",
      ...(isAdmin
        ? {
            eligible_roles: form.eligible_roles,
            cross_functional: form.cross_functional,
            review_status: form.review_status,
          }
        : {}),
    };

    setSaving(true);
    try {
      const { error } = editingId
        ? await supabase.from("questions").update(payload).eq("id", editingId)
        : await supabase.from("questions").insert(payload);
      if (error) {
        toast.error(userFacingDbError(error, "save"));
        return;
      }
      toast.success(editingId ? "Question updated." : "Question created.");
      setForm(EMPTY_FORM);
      setEditingId(null);
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function setStatusFor(id: string, publish_status: "draft" | "published" | "archived") {
    const row = rows.find((r) => r.id === id);
    if (publish_status === "published") {
      const gate = assertPublishableForTrigger(row);
      if (gate) {
        toast.error(gate);
        return;
      }
    }

    const built = buildQuestionPublishPatch({
      targetStatus: publish_status,
      isAdmin: Boolean(isAdmin),
    });
    if (!built.ok) {
      toast.error((built as { reason?: string }).reason ?? "Could not update publish status.");
      return;
    }

    const { error } = await supabase
      .from("questions")
      .update(built.patch)
      .eq("id", id);
    if (error) toast.error(userFacingDbError(error, "save"));
    else void load();
  }

  async function duplicate(row: BankRow) {
    if (!user?.id) return;
    const { error } = await supabase.from("questions").insert({
      question_text: row.question_text,
      question_type: row.question_type,
      options: row.options,
      correct_answer: row.correct_answer,
      explanation: row.explanation,
      image_url: row.image_url ?? null,
      has_image: Boolean(row.has_image ?? row.image_url),
      metadata: row.metadata ?? {},
      subject: row.subject,
      category: row.category ?? row.subject,
      topic: row.topic,
      difficulty: row.difficulty,
      tags: row.tags,
      license_type: row.license_type ?? "USER_OWNED",
      copyright_status: row.license_type ?? "USER_OWNED",
      source: "USER_UPLOAD",
      content_owner: user.id,
      created_by: user.id,
      uploaded_by: user.id,
      exam_type: "CLARIFY_ORIGINAL",
      is_public: false,
      publish_status: "draft",
    });
    if (error) toast.error(userFacingDbError(error, "save"));
    else {
      toast.success("Duplicated as draft.");
      void load();
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "question-bank.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(file: File) {
    const existing = rows.map((r) =>
      questionFingerprint(r.question_text, (r.options ?? []).map((o) => o.text)),
    );
    let rawRows: Record<string, unknown>[] = [];
    if (file.name.endsWith(".json")) {
      rawRows = JSON.parse(await file.text()) as Record<string, unknown>[];
      if (!Array.isArray(rawRows)) rawRows = [];
    } else if (file.name.endsWith(".csv")) {
      rawRows = parseCsvText(await file.text());
    } else {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[];
    }
    const report = buildImportReport(rawRows.map(mapRawImportRow), existing);
    setImportReport(report);
    if (!user?.id || report.records.length === 0) return;
    const { error } = await supabase.from("questions").insert(report.records.map((r) => toBankInsert(r, user.id)));
    if (error) toast.error(userFacingDbError(error, "save"));
    else {
      toast.success(`Imported ${report.imported} questions.`);
      void load();
    }
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Question Bank"
        description="Original, user-authored, and licensed questions you have rights to use. Copyrighted exam banks are not imported here."
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Question Bank" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportJson} leftIcon={<Download className="h-4 w-4" />}>
              Export
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,.xlsx,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImportFile(file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex">
                <Button type="button" variant="outline" size="sm" leftIcon={<Upload className="h-4 w-4" />}>
                  Import
                </Button>
              </span>
            </label>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2 min-w-0">
          <h2 className="mb-3 text-sm font-semibold">{editingId ? "Edit question" : "Create question"}</h2>
          <div className="space-y-3">
            <Textarea
              value={form.question_text}
              onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              placeholder="Question"
              className="min-h-[88px]"
            />
            <div className="space-y-1">
              <Input
                value={form.image_url}
                placeholder="Question image URL (optional)"
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
              {isUsableQuestionImageUrl(form.image_url) && (
                <img
                  src={resolveQuestionImageUrl(form.image_url)}
                  alt="Question preview"
                  className="max-h-36 rounded-lg border border-border object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Paste a direct image URL for diagrams or figures in the question stem.
              </p>
            </div>
            {form.question_type === "MCQ" ? (
            <div className="space-y-3">
              {MCQ_OPTION_KEYS.map(({ text, image, label }) => (
                <div key={text} className="space-y-1 rounded-lg border border-border/60 p-2">
                  <Input
                    value={form[text]}
                    placeholder={`Option ${label}`}
                    onChange={(e) => setForm({ ...form, [text]: e.target.value })}
                  />
                  <Input
                    value={form[image]}
                    placeholder={`Option ${label} image URL (optional)`}
                    onChange={(e) => setForm({ ...form, [image]: e.target.value })}
                    className="text-xs"
                  />
                  {isUsableQuestionImageUrl(form[image]) && (
                    <img
                      src={resolveQuestionImageUrl(form[image])}
                      alt={`Option ${label} preview`}
                      className="max-h-24 rounded border border-border object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Option images use the URL field; text and image can be combined.
              </p>
            </div>
            ) : form.question_type === "TRUE_FALSE" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Correct answer</p>
                <div className="flex gap-3">
                  {(["True", "False"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, correct_answer: value })}
                      className={cn(
                        "rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors",
                        form.correct_answer === value
                          ? "border-green-500 bg-green-500/10 text-green-600"
                          : "border-border text-muted-foreground hover:border-green-400",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ) : form.question_type === "CODING" ? (
              <CodingQuestionFields
                value={form as CodingQuestionFieldValues}
                onChange={(next) => setForm({ ...form, ...next })}
              />
            ) : (
              <Textarea
                value={form.correct_answer}
                placeholder="Expected answer"
                onChange={(e) => setForm({ ...form, correct_answer: e.target.value })}
                className="min-h-[88px]"
              />
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input value={form.category} placeholder="Category" onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Input value={form.topic} placeholder="Topic" onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select value={form.question_type} onValueChange={handleQuestionTypeChange}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                <SelectTrigger><SelectValue placeholder="Difficulty" /></SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {form.question_type === "MCQ" && (
              <Input value={form.correct_answer} placeholder="Correct (A/B/C/D)" onChange={(e) => setForm({ ...form, correct_answer: e.target.value.toUpperCase() })} />
              )}
              <Select value={form.license_type} onValueChange={(v) => setForm({ ...form, license_type: v as LicenseType })}>
                <SelectTrigger><SelectValue placeholder="License" /></SelectTrigger>
                <SelectContent>
                  {LICENSE_TYPES.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input value={form.tags} placeholder="Tags (comma separated)" onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            {isAdmin && (
              <>
                <Select value={form.review_status} onValueChange={(v) => setForm({ ...form, review_status: v as typeof form.review_status })}>
                  <SelectTrigger><SelectValue placeholder="Review status" /></SelectTrigger>
                  <SelectContent>
                    {REVIEW_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={form.cross_functional}
                    onChange={(e) => setForm({ ...form, cross_functional: e.target.checked })}
                  />
                  Cross-functional (may appear in overlapping templates)
                </label>
                <fieldset className="space-y-1">
                  <legend className="text-xs text-muted-foreground">Assessment eligibility</legend>
                  <div className="flex flex-wrap gap-2">
                    {ASSESSMENT_ROLE_SLUGS.map((role) => (
                      <label key={role} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={form.eligible_roles.includes(role)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.eligible_roles, role]
                              : form.eligible_roles.filter((item) => item !== role);
                            setForm({ ...form, eligible_roles: next });
                          }}
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            <Textarea value={form.explanation} placeholder="Explanation" onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
            <Button onClick={() => void saveQuestion()} loading={saving} leftIcon={<Plus className="h-4 w-4" />}>
              {editingId ? "Save changes" : "Create"}
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-3 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1 basis-full sm:basis-64 md:basis-72">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                leftIcon={<Search className="h-4 w-4" />}
                aria-label="Search question bank"
              />
            </div>
            <Filter className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[8.5rem] shrink-0" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[8.5rem] shrink-0" aria-label="Filter by difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Difficulty</SelectItem>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[8.5rem] shrink-0" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Type</SelectItem>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[8.5rem] shrink-0" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={license} onValueChange={setLicense}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[8.5rem] shrink-0" aria-label="Filter by license">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">License</SelectItem>
                {LICENSE_TYPES.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {importReport && (
            <Card>
              <pre className="whitespace-pre-wrap text-sm">{formatImportReport(importReport)}</pre>
            </Card>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : loadError ? (
            <InlineErrorRetry message={loadError} onRetry={() => void load()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              compact
              icon={Search}
              title={rows.length === 0 ? "No questions yet" : "No matches"}
              description={
                rows.length === 0
                  ? "Create a question on the left. Answer keys stay on your own items only — live exams never read them from this list."
                  : "Try a different search or filter."
              }
            />
          ) : (
            <ul className="space-y-2">
              {filtered.map((row) => (
                <li key={row.id}>
                  <Card className="min-w-0">
                    <p className="text-sm font-medium break-words">{row.question_text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.category ?? row.subject} · {row.topic} · {row.difficulty} · {row.question_type} · {row.license_type} · {row.publish_status}
                      {row.has_image || row.image_url ? " · has image" : ""}
                      {row.question_type === "CODING" ? " · coding" : ""}
                      {row.review_status ? ` · ${row.review_status}` : ""}
                      {(row.eligible_roles ?? []).length > 0 ? ` · ${row.eligible_roles?.join(", ")}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="xs" variant="outline" onClick={() => setPreview(row)}>Preview</Button>
                      <Button size="xs" variant="outline" onClick={() => {
                        const mcq = mcqFieldsFromOptions(row.options);
                        const isTrueFalse = row.question_type === "TRUE_FALSE";
                        const isCoding = row.question_type === "CODING";
                        const codingFields = isCoding ? codingFieldsFromMetadata(row.metadata) : {};
                        setEditingId(row.id);
                        setForm({
                          question_text: row.question_text,
                          question_type: row.question_type,
                          image_url: row.image_url ?? "",
                          ...mcq,
                          ...codingFields,
                          correct_answer: isTrueFalse
                            ? trueFalseLabelFromAnswer(row.correct_answer)
                            : isCoding
                              ? CODING_AUTO_CORRECT_ANSWER
                              : row.correct_answer,
                          category: row.category ?? row.subject,
                          topic: row.topic,
                          difficulty: row.difficulty ?? "MEDIUM",
                          explanation: row.explanation ?? "",
                          tags: (row.tags ?? []).join(", "),
                          license_type: (row.license_type as LicenseType) ?? "USER_OWNED",
                          source: row.source ?? "USER_UPLOAD",
                          eligible_roles: row.eligible_roles ?? [],
                          cross_functional: Boolean(row.cross_functional),
                          review_status: (row.review_status as typeof EMPTY_FORM.review_status) ?? "unreviewed",
                        });
                      }}>Edit</Button>
                      <Button size="xs" variant="outline" leftIcon={<Copy className="h-3 w-3" />} onClick={() => void duplicate(row)}>Duplicate</Button>
                      {isAdmin && row.publish_status !== "published" && (
                        <Button size="xs" onClick={() => void setStatusFor(row.id, "published")}>Publish</Button>
                      )}
                      {isAdmin && row.publish_status === "published" && (
                        <Button size="xs" variant="outline" onClick={() => void setStatusFor(row.id, "draft")}>Unpublish</Button>
                      )}
                      {isAdmin && row.review_status !== "approved" && (
                        <Button size="xs" variant="outline" onClick={() => void supabase.from("questions").update({ review_status: "approved" }).eq("id", row.id).then(({ error }) => { if (error) toast.error(userFacingDbError(error, "save")); else void load(); })}>
                          Approve
                        </Button>
                      )}
                      {isAdmin && row.review_status !== "rejected" && (
                        <Button size="xs" variant="outline" onClick={() => void supabase.from("questions").update({ review_status: "rejected", publish_status: "draft", is_public: false }).eq("id", row.id).then(({ error }) => { if (error) toast.error(userFacingDbError(error, "save")); else void load(); })}>
                          Reject
                        </Button>
                      )}
                      {isAdmin && row.publish_status !== "archived" && (
                        <Button size="xs" variant="ghost" onClick={() => void setStatusFor(row.id, "archived")}>Disable</Button>
                      )}
                      {!isAdmin && (
                        <Button size="xs" variant="ghost" onClick={() => void setStatusFor(row.id, "archived")}>Archive</Button>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setPreview(null)}>
          <div className={cn("w-full max-w-lg min-w-0")} onClick={(e) => e.stopPropagation()}>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Preview</h3>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">{preview.question_type}</span>
            </div>
            <p className="mt-2 text-sm break-words">{preview.question_text}</p>
            {uniqueImageUrls(preview.image_url, preview.question_text).map((src) => (
              <img
                key={src}
                src={src}
                alt="Question figure"
                className="mt-3 max-h-48 w-full rounded-lg border border-border object-contain"
              />
            ))}
            {(preview.question_type === "MCQ" || preview.question_type === "TRUE_FALSE") && (
              <ul className="mt-3 space-y-2 text-sm">
                {(preview.question_type === "TRUE_FALSE" && (preview.options ?? []).length < 2
                  ? [
                      { label: "A", text: "True" },
                      { label: "B", text: "False" },
                    ]
                  : preview.options ?? []
                ).map((o) => {
                  const parsed = parseOptionText(o.text);
                  const isCorrect =
                    preview.question_type === "TRUE_FALSE"
                      ? o.label === (["A", "TRUE", "T"].includes(preview.correct_answer.toUpperCase()) ? "A" : "B")
                      : o.label === preview.correct_answer.toUpperCase();
                  return (
                    <li
                      key={o.label}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        isCorrect && "border-green-500/50 bg-green-500/5",
                      )}
                    >
                      <span className="font-medium">{o.label}.</span>{" "}
                      {parsed.text || (preview.question_type === "TRUE_FALSE" ? o.text : "")}
                      {isUsableQuestionImageUrl(parsed.imageUrl) && (
                        <img
                          src={resolveQuestionImageUrl(parsed.imageUrl)}
                          alt={`Option ${o.label}`}
                          className="mt-2 max-h-28 rounded border border-border object-contain"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {preview.question_type === "CODING" && (() => {
              const coding = parseQuestionCodingMetadata(preview.metadata);
              if (!coding) {
                return (
                  <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                    Coding configuration is incomplete. Add starter code and test cases, then save again.
                  </p>
                );
              }
              return (
                <div className="mt-3 space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-xs">
                  <p><span className="font-medium">Language:</span> {coding.language}</p>
                  <p><span className="font-medium">Sample I/O:</span> {coding.sample_input} → {coding.sample_output}</p>
                  <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">{coding.starter_code}</pre>
                  <p className="text-muted-foreground">
                    {coding.test_cases.filter((c) => !c.is_hidden).length} visible and{" "}
                    {coding.test_cases.filter((c) => c.is_hidden).length} hidden judge case(s).
                  </p>
                </div>
              );
            })()}
            {preview.explanation && (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Explanation:</span> {preview.explanation}
              </p>
            )}
            <p className="mt-3 text-sm">
              <span className="font-medium">Correct answer:</span>{" "}
              {preview.question_type === "TRUE_FALSE"
                ? trueFalseLabelFromAnswer(preview.correct_answer)
                : preview.question_type === "CODING"
                  ? "Auto-scored against hidden test cases in mock tests"
                  : preview.correct_answer}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Answer keys stay on your own items only — live exams never read them from this list.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}
