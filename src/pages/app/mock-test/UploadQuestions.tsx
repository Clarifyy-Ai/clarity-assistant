import { useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Upload, X, Check, AlertCircle,
  Plus, Eye, EyeOff, Loader2,
  BookOpen, Save,
} from "lucide-react";
import { toast } from "sonner";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedQuestion {
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING";
  options: Array<{ label: string; text: string }> | null;
  correct_answer: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks_positive: number;
  marks_negative: number;
  source_year: number | null;
  exam_type: string | null;
  latex_present: boolean;
}

interface ReviewItem extends ParsedQuestion {
  _id: string;
  _removed: boolean;
  _editing: boolean;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  EASY:   "bg-green-500/10 text-green-600",
  MEDIUM: "bg-amber-500/10 text-amber-600",
  HARD:   "bg-red-500/10  text-red-600",
};

const EXAM_TYPES = [
  "JEE_MAIN", "JEE_ADVANCED", "NEET", "UPSC", "SSC_CGL",
  "SSC_CHSL", "IBPS_PO", "SBI_PO", "RRB_NTPC", "NDA", "CDS", "CUSTOM",
];

const SUBJECTS = [
  "Physics", "Chemistry", "Mathematics", "Biology",
  "History", "Geography", "Economics", "General Knowledge",
  "Reasoning", "English", "Computer Science", "Other",
];

// ─────────────────────────────────────────────────────────────────────────────
// LaTeX Preview helper — renders inline ($...$) and block ($$...$$) math
// ─────────────────────────────────────────────────────────────────────────────

function LaTeXPreview({ text }: { text: string }) {
  if (!text?.trim()) {
    return <p className="text-muted-foreground text-sm italic">Preview will appear here…</p>;
  }

  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  const inlineRegex = /\$((?:[^$\\]|\\.)+?)\$/g;

  let match: RegExpExecArray | null;

  const segments: Array<{ start: number; end: number; type: "block" | "inline"; math: string }> = [];

  // Find block math
  blockRegex.lastIndex = 0;
  while ((match = blockRegex.exec(text)) !== null) {
    segments.push({ start: match.index, end: match.index + match[0].length, type: "block", math: match[1] });
  }

  // Find inline math, only in regions not covered by block math
  inlineRegex.lastIndex = 0;
  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlaps = segments.some((s) => start < s.end && end > s.start);
    if (!overlaps) {
      segments.push({ start, end, type: "inline", math: match[1] });
    }
  }

  // Sort by start position
  segments.sort((a, b) => a.start - b.start);

  let cursor = 0;
  const tokens: Array<{ type: "text" | "inline" | "block"; content: string }> = [];
  for (const seg of segments) {
    if (seg.start > cursor) {
      tokens.push({ type: "text", content: text.slice(cursor, seg.start) });
    }
    tokens.push({ type: seg.type, content: seg.math });
    cursor = seg.end;
  }
  if (cursor < text.length) {
    tokens.push({ type: "text", content: text.slice(cursor) });
  }

  return (
    <div className="text-sm text-foreground leading-relaxed">
      {tokens.map((token, i) => {
        if (token.type === "block") {
          return (
            <div key={i} className="my-2 text-center overflow-x-auto">
              <BlockMath math={token.content} errorColor="#e74c3c" />
            </div>
          );
        }
        if (token.type === "inline") {
          return <InlineMath key={i} math={token.content} errorColor="#e74c3c" />;
        }
        // plain text — preserve newlines
        return (
          <span key={i}>
            {token.content.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual Creator Form
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM: ParsedQuestion = {
  question_text:  "",
  question_type:  "MCQ",
  options:        [
    { label: "A", text: "" },
    { label: "B", text: "" },
    { label: "C", text: "" },
    { label: "D", text: "" },
  ],
  correct_answer: "A",
  explanation:    "",
  subject:        "Physics",
  topic:          "",
  difficulty:     "MEDIUM",
  marks_positive: 4,
  marks_negative: 1,
  source_year:    null,
  exam_type:      null,
  latex_present:  false,
};

function ManualCreator({ onSaved }: { onSaved: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm]         = useState<ParsedQuestion>({ ...EMPTY_FORM, options: [...(EMPTY_FORM.options ?? [])] });
  const [preview, setPreview]   = useState(false);
  const [saving, setSaving]     = useState(false);

  function setField<K extends keyof ParsedQuestion>(key: K, value: ParsedQuestion[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setOption(idx: number, text: string) {
    setForm((prev) => {
      const opts = [...(prev.options ?? [])];
      opts[idx] = { ...opts[idx], text };
      return { ...prev, options: opts };
    });
  }

  async function handleSave() {
    if (!form.question_text.trim()) { toast.error("Question text is required."); return; }
    if (!form.topic.trim()) { toast.error("Topic is required."); return; }
    if (form.question_type === "MCQ") {
      if (!form.options?.every((o) => o.text.trim())) { toast.error("All 4 MCQ options are required."); return; }
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("questions").insert({
        question_text:  form.question_text.trim(),
        question_type:  form.question_type,
        options:        form.question_type === "MCQ" ? form.options : null,
        correct_answer: form.correct_answer,
        explanation:    form.explanation,
        subject:        form.subject,
        topic:          form.topic.trim(),
        difficulty:     form.difficulty,
        marks_positive: form.marks_positive,
        marks_negative: form.marks_negative,
        source_year:    form.source_year,
        exam_type:      form.exam_type,
        latex_present:  form.latex_present,
        uploaded_by:    user!.id,
        source:         "USER_UPLOAD",
        is_public:      false,
        is_verified:    false,
      });
      if (error) throw error;
      toast.success("Question saved to your bank.");
      setForm({ ...EMPTY_FORM, options: [...(EMPTY_FORM.options ?? [])] });
      onSaved();
    } catch (err) {
      console.error("[ManualCreator] save error:", err);
      toast.error("Failed to save question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Question text */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Question Text</Label>
            <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
              {preview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              {preview ? "Edit" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-[100px] rounded-lg border bg-muted/10 p-3">
              <LaTeXPreview text={form.question_text} />
            </div>
          ) : (
            <Textarea
              className="min-h-[100px] font-mono text-sm"
              placeholder="Type your question here. Use $...$ for inline LaTeX and $$...$$ for block LaTeX."
              value={form.question_text}
              onChange={(e) => setField("question_text", e.target.value)}
            />
          )}
          <p className="text-xs text-muted-foreground">LaTeX: use $x^2$ for inline, $$\frac{a}{b}$$ for block</p>
        </div>

        {/* Question type */}
        <div className="space-y-2">
          <Label>Question Type</Label>
          <Select
            value={form.question_type}
            onValueChange={(v) => setField("question_type", v as ParsedQuestion["question_type"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MCQ">MCQ (4 options)</SelectItem>
              <SelectItem value="TRUE_FALSE">True / False</SelectItem>
              <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
              <SelectItem value="NUMERICAL">Numerical</SelectItem>
              <SelectItem value="CODING">Coding</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select
            value={form.difficulty}
            onValueChange={(v) => setField("difficulty", v as ParsedQuestion["difficulty"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EASY">Easy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HARD">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* MCQ options */}
        {form.question_type === "MCQ" && (
          <div className="md:col-span-2 space-y-2">
            <Label>Answer Options</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(form.options ?? []).map((opt, i) => (
                <div key={opt.label} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setField("correct_answer", opt.label)}
                    className={`h-7 w-7 shrink-0 rounded-full border-2 text-xs font-bold transition-colors ${
                      form.correct_answer === opt.label
                        ? "border-green-500 bg-green-500/10 text-green-600"
                        : "border-border text-muted-foreground hover:border-green-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                  <Input
                    placeholder={`Option ${opt.label}`}
                    value={opt.text}
                    onChange={(e) => setOption(i, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Click the letter to mark the correct answer.</p>
          </div>
        )}

        {/* Correct answer for non-MCQ */}
        {form.question_type !== "MCQ" && (
          <div className="md:col-span-2 space-y-2">
            <Label>Correct Answer</Label>
            <Input
              placeholder={form.question_type === "NUMERICAL" ? "e.g. 42.5" : "Enter the correct answer"}
              value={form.correct_answer}
              onChange={(e) => setField("correct_answer", e.target.value)}
            />
          </div>
        )}

        {/* Explanation */}
        <div className="md:col-span-2 space-y-2">
          <Label>Explanation</Label>
          <Textarea
            placeholder="Why is this answer correct? (helps during revision)"
            value={form.explanation}
            onChange={(e) => setField("explanation", e.target.value)}
            className="min-h-[80px] text-sm"
          />
        </div>

        {/* Subject */}
        <div className="space-y-2">
          <Label>Subject</Label>
          <Select value={form.subject} onValueChange={(v) => setField("subject", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Topic */}
        <div className="space-y-2">
          <Label>Topic / Subtopic</Label>
          <Input
            placeholder="e.g. Newton's Laws, Organic Chemistry"
            value={form.topic}
            onChange={(e) => setField("topic", e.target.value)}
          />
        </div>

        {/* Exam type */}
        <div className="space-y-2">
          <Label>Exam Type (optional)</Label>
          <Select
            value={form.exam_type ?? "none"}
            onValueChange={(v) => setField("exam_type", v === "none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select exam" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None / General</SelectItem>
              {EXAM_TYPES.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Marks */}
        <div className="space-y-2">
          <Label>Marks (positive / negative)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.25"
              min="0"
              value={form.marks_positive}
              onChange={(e) => setField("marks_positive", parseFloat(e.target.value) || 0)}
              className="text-sm"
            />
            <Input
              type="number"
              step="0.25"
              min="0"
              value={form.marks_negative}
              onChange={(e) => setField("marks_negative", parseFloat(e.target.value) || 0)}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Question
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review Modal — shown after PDF parse
// ─────────────────────────────────────────────────────────────────────────────

function ReviewModal({
  items,
  onClose,
  onSaveAll,
  saving,
}: {
  items: ReviewItem[];
  onClose: () => void;
  onSaveAll: (items: ReviewItem[]) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState<ReviewItem[]>(items);

  function remove(id: string) {
    setLocal((prev) => prev.map((q) => q._id === id ? { ...q, _removed: true } : q));
  }

  function updateField(id: string, key: keyof ParsedQuestion, value: unknown) {
    setLocal((prev) => prev.map((q) => q._id === id ? { ...q, [key]: value } : q));
  }

  const visible = local.filter((q) => !q._removed);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Review Parsed Questions — {visible.length} ready to save
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {visible.map((q) => (
            <Card key={q._id} className="border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground flex-1">
                    {q.question_text.length > 150 ? q.question_text.slice(0, 150) + "…" : q.question_text}
                  </p>
                  <button
                    type="button"
                    onClick={() => remove(q._id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className={DIFFICULTY_COLOR[q.difficulty]}>{q.difficulty}</Badge>
                  <Badge variant="outline">{q.question_type}</Badge>
                  <Badge variant="outline">{q.subject}</Badge>
                  <Badge variant="outline" className="text-muted-foreground">{q.topic}</Badge>
                  {q.exam_type && <Badge variant="outline">{q.exam_type}</Badge>}
                  {q.source_year && <Badge variant="outline">{q.source_year}</Badge>}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Correct Answer</p>
                    <Input
                      className="h-7 text-xs"
                      value={q.correct_answer}
                      onChange={(e) => updateField(q._id, "correct_answer", e.target.value)}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Subject</p>
                    <Input
                      className="h-7 text-xs"
                      value={q.subject}
                      onChange={(e) => updateField(q._id, "subject", e.target.value)}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Difficulty</p>
                    <Select
                      value={q.difficulty}
                      onValueChange={(v) => updateField(q._id, "difficulty", v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EASY">Easy</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HARD">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {visible.length === 0 && (
            <p className="text-center text-muted-foreground py-6">All questions removed.</p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSaveAll(local)} disabled={saving || visible.length === 0}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Save {visible.length} Question{visible.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Import Tab
// ─────────────────────────────────────────────────────────────────────────────

function PDFImportTab({ onImported }: { onImported: (count: number) => void }) {
  const user = useAuthStore((s) => s.user);
  const fileRef   = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]     = useState(false);
  const [parsing,  setParsing]      = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);
  const [saving, setSaving]           = useState(false);
  const [summary, setSummary]         = useState<string | null>(null);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function processFile(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("PDF must be under 10 MB.");
      return;
    }

    setParsing(true);
    setParseError(null);
    setSummary(null);

    try {
      // Convert PDF to base64
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const pdf_base64 = btoa(binary);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke("parse-question-pdf", {
        body: { pdf_base64 },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? "Parse failed");

      const { questions, summary: parseSummary } = data.data;

      const reviewItems: ReviewItem[] = (questions as ParsedQuestion[]).map((q, i) => ({
        ...q,
        _id:      `q_${i}_${Date.now()}`,
        _removed: false,
        _editing: false,
      }));

      setReviewItems(reviewItems);
      setSummary(parseSummary);
    } catch (err) {
      console.error("[PDFImportTab] parse error:", err);
      const msg = err instanceof Error ? err.message : "Failed to parse PDF.";
      setParseError(msg);
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveAll(items: ReviewItem[]) {
    const toSave = items.filter((q) => !q._removed);
    if (!toSave.length) return;

    setSaving(true);
    try {
      const rows = toSave.map((q) => ({
        question_text:  q.question_text,
        question_type:  q.question_type,
        options:        q.question_type === "MCQ" ? q.options : null,
        correct_answer: q.correct_answer,
        explanation:    q.explanation,
        subject:        q.subject,
        topic:          q.topic,
        difficulty:     q.difficulty,
        marks_positive: q.marks_positive,
        marks_negative: q.marks_negative,
        source_year:    q.source_year,
        exam_type:      q.exam_type,
        latex_present:  q.latex_present,
        uploaded_by:    user!.id,
        source:         "USER_UPLOAD",
        is_public:      false,
        is_verified:    false,
      }));

      const { error } = await supabase.from("questions").insert(rows);
      if (error) throw error;

      toast.success(summary ?? `${toSave.length} questions saved.`);
      setReviewItems(null);
      setSummary(null);
      onImported(toSave.length);
    } catch (err) {
      console.error("[PDFImportTab] save error:", err);
      toast.error("Failed to save questions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Drop zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer ${
          dragging ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-500/50 hover:bg-muted/10"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={handleFileChange}
        />

        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
            <p className="font-medium text-foreground">Parsing PDF with AI…</p>
            <p className="text-sm text-muted-foreground">This may take 15–30 seconds.</p>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">Drop your PDF here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse · Max 10 MB</p>
            <p className="text-xs text-muted-foreground mt-3">
              Supports JEE, NEET, UPSC, SSC, IBPS question papers and more
            </p>
          </>
        )}
      </div>

      {parseError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {parseError}
        </div>
      )}

      {summary && !reviewItems && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          <Check className="h-4 w-4 shrink-0" />
          {summary}
        </div>
      )}

      {/* Credit cost notice */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Each PDF import costs <strong>5 credits</strong>. The AI will extract all questions and answers automatically.</span>
      </div>

      {/* Review modal */}
      {reviewItems && (
        <ReviewModal
          items={reviewItems}
          onClose={() => setReviewItems(null)}
          onSaveAll={handleSaveAll}
          saving={saving}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadQuestions() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = searchParams.get("tab") === "manual" ? "manual" : "pdf";
  const [questionCount, setQuestionCount] = useState(0);

  function handleImported(count: number) {
    setQuestionCount((prev) => prev + count);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import Questions"
        description="Upload a PDF question paper or create questions manually. Questions are saved to your personal bank."
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="pdf">
            <Upload className="h-4 w-4 mr-2" />
            Import PDF
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Plus className="h-4 w-4 mr-2" />
            Create Manually
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pdf" className="mt-5 space-y-4">
          <PDFImportTab onImported={handleImported} />
        </TabsContent>

        <TabsContent value="manual" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create a Question</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualCreator onSaved={() => setQuestionCount((p) => p + 1)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {questionCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span>{questionCount} question{questionCount !== 1 ? "s" : ""} added this session.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/app/mock-test/my-questions")}>
            <BookOpen className="h-4 w-4 mr-2" />
            View My Bank
          </Button>
        </div>
      )}
    </div>
  );
}
