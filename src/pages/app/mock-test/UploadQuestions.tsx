// src/pages/app/mock-test/UploadQuestions.tsx
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import { toast } from "sonner";
import { normalizeExamTypeForStorage } from "@/lib/mock-test/examTypes";

import { supabase } from "@/lib/supabase/client";
import { questionsDB } from "@/lib/supabase/database";
import { SUPABASE_URL } from "@/lib/env";
import { useAuthStore } from "@/store/userStore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import ExcelImportTab from "./ExcelImportTab";

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
  image_url: string;
}

interface ReviewItem extends ParsedQuestion {
  _id: string;
  _removed: boolean;
}

const EXAM_TYPES = [
  "JEE_MAIN",
  "JEE_ADVANCED",
  "NEET",
  "UPSC",
  "SSC_CGL",
  "SSC_CHSL",
  "IBPS_PO",
  "SBI_PO",
  "RRB_NTPC",
  "NDA",
  "CDS",
  "CUSTOM",
];

const SUBJECTS = [
  "Physics",
  "Chemistry",
  "Mathematics",
  "Biology",
  "History",
  "Geography",
  "Economics",
  "General Knowledge",
  "Reasoning",
  "English",
  "Computer Science",
  "Other",
];

function LaTeXPreview({ text }: { text: string }) {
  if (!text?.trim()) {
    return <p className="text-sm italic text-muted-foreground">Preview will appear here…</p>;
  }

  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  const inlineRegex = /\$((?:[^$\\]|\\.)+?)\$/g;

  let match: RegExpExecArray | null;
  const segments: Array<{
    start: number;
    end: number;
    type: "block" | "inline";
    math: string;
  }> = [];

  blockRegex.lastIndex = 0;
  while ((match = blockRegex.exec(text)) !== null) {
    segments.push({
      start: match.index,
      end: match.index + match[0].length,
      type: "block",
      math: match[1],
    });
  }

  inlineRegex.lastIndex = 0;
  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlaps = segments.some((s) => start < s.end && end > s.start);
    if (!overlaps) {
      segments.push({
        start,
        end,
        type: "inline",
        math: match[1],
      });
    }
  }

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
    <div className="leading-relaxed text-sm text-foreground">
      {tokens.map((token, i) => {
        if (token.type === "block") {
          return (
            <div key={i} className="my-2 overflow-x-auto text-center">
              <BlockMath math={token.content} errorColor="#e74c3c" />
            </div>
          );
        }

        if (token.type === "inline") {
          return <InlineMath key={i} math={token.content} errorColor="#e74c3c" />;
        }

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

const EMPTY_FORM: ParsedQuestion = {
  question_text: "",
  question_type: "MCQ",
  options: [
    { label: "A", text: "" },
    { label: "B", text: "" },
    { label: "C", text: "" },
    { label: "D", text: "" },
  ],
  correct_answer: "A",
  explanation: "",
  subject: "Physics",
  topic: "",
  difficulty: "MEDIUM",
  marks_positive: 4,
  marks_negative: 1,
  source_year: null,
  exam_type: null,
  latex_present: false,
  image_url: "",
};

function ManualCreator({ onSaved }: { onSaved: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState<ParsedQuestion>({
    ...EMPTY_FORM,
    options: [...(EMPTY_FORM.options ?? [])],
  });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof ParsedQuestion>(key: K, value: ParsedQuestion[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setOption(index: number, text: string) {
    setForm((prev) => {
      const options = [...(prev.options ?? [])];
      options[index] = { ...options[index], text };
      return { ...prev, options };
    });
  }

  async function handleSave() {
    if (!user?.id) {
      toast.error("Please log in first.");
      return;
    }

    if (!form.question_text.trim()) {
      toast.error("Question text is required.");
      return;
    }

    if (!form.topic.trim()) {
      toast.error("Topic is required.");
      return;
    }

    if (form.question_type === "MCQ" && !form.options?.every((o) => o.text.trim())) {
      toast.error("All 4 MCQ options are required.");
      return;
    }

    const latexPresent =
      /\$|\\\(|\\\[/.test(form.question_text) ||
      /\$|\\\(|\\\[/.test(form.explanation);

    setSaving(true);

    try {
      await questionsDB.create({
        question_text: form.question_text.trim(),
        question_type: form.question_type,
        options: form.question_type === "MCQ" ? form.options : null,
        correct_answer: form.correct_answer,
        explanation: form.explanation,
        subject: form.subject,
        topic: form.topic.trim(),
        difficulty: form.difficulty,
        marks_positive: form.marks_positive,
        marks_negative: form.marks_negative,
        source_year: form.source_year,
        exam_type: normalizeExamTypeForStorage(form.exam_type),
        image_url: form.image_url?.trim() || null,
        has_image: Boolean(form.image_url?.trim()),
        latex_present: latexPresent,
        uploaded_by: user.id,
        source: "USER_UPLOAD",
        is_public: false,
        is_verified: false,
      });

      toast.success("Question saved to your bank.");
      setForm({
        ...EMPTY_FORM,
        options: [...(EMPTY_FORM.options ?? [])],
      });
      onSaved();
    } catch (error) {
      console.error("[ManualCreator] save error:", error);
      toast.error("Failed to save question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Question Text</Label>
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
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

          <p className="text-xs text-muted-foreground">
            LaTeX: use $x^2$ for inline, $$\frac{"{a}"}{"{b}"}$$ for block
          </p>
        </div>

        <div className="space-y-2">
          <Label>Question Type</Label>
          <Select
            value={form.question_type}
            onValueChange={(value) => {
              setField("question_type", value as ParsedQuestion["question_type"]);
              if (value === "TRUE_FALSE") setField("correct_answer", "True");
              else if (value === "MCQ") setField("correct_answer", "A");
            }}
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

        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select
            value={form.difficulty}
            onValueChange={(value) =>
              setField("difficulty", value as ParsedQuestion["difficulty"])
            }
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

        {form.question_type === "MCQ" && (
          <div className="space-y-2 md:col-span-2">
            <Label>Answer Options</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(form.options ?? []).map((opt, index) => (
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
                    onChange={(e) => setOption(index, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Click the letter to mark the correct answer.
            </p>
          </div>
        )}

        {form.question_type === "TRUE_FALSE" && (
          <div className="space-y-2 md:col-span-2">
            <Label>Correct Answer</Label>
            <div className="flex gap-3">
              {["True", "False"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setField("correct_answer", value)}
                  className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                    form.correct_answer === value
                      ? "border-green-500 bg-green-500/10 text-green-600"
                      : "border-border text-muted-foreground hover:border-green-400"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}

        {form.question_type !== "MCQ" && form.question_type !== "TRUE_FALSE" && (
          <div className="space-y-2 md:col-span-2">
            <Label>Correct Answer</Label>
            <Input
              placeholder={
                form.question_type === "NUMERICAL"
                  ? "e.g. 42.5"
                  : "Enter the correct answer"
              }
              value={form.correct_answer}
              onChange={(e) => setField("correct_answer", e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <Label>Explanation</Label>
          <Textarea
            placeholder="Why is this answer correct? (helps during revision)"
            value={form.explanation}
            onChange={(e) => setField("explanation", e.target.value)}
            className="min-h-[80px] text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Subject</Label>
          <Select value={form.subject} onValueChange={(value) => setField("subject", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Topic / Subtopic</Label>
          <Input
            placeholder="e.g. Newton's Laws, Organic Chemistry"
            value={form.topic}
            onChange={(e) => setField("topic", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Exam Type (optional)</Label>
          <Select
            value={form.exam_type ?? "none"}
            onValueChange={(value) => setField("exam_type", value === "none" ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select exam" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None / General</SelectItem>
              {EXAM_TYPES.map((examType) => (
                <SelectItem key={examType} value={examType}>
                  {examType.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <div className="space-y-2 md:col-span-2">
          <Label>Question Image URL (optional)</Label>
          <Input
            placeholder="https://example.com/image.png"
            value={form.image_url}
            onChange={(e) => setField("image_url", e.target.value)}
            className="text-sm"
          />
          {form.image_url?.trim() && (
            <img
              src={form.image_url}
              alt="Question image preview"
              className="mt-2 max-h-40 rounded-lg border border-border object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Paste a direct image URL if this question includes a diagram or figure.
          </p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save Question
      </Button>
    </div>
  );
}

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
    setLocal((prev) =>
      prev.map((question) =>
        question._id === id ? { ...question, _removed: true } : question
      )
    );
  }

  function updateField(id: string, key: keyof ParsedQuestion, value: unknown) {
    setLocal((prev) =>
      prev.map((question) =>
        question._id === id ? { ...question, value } : question
      )
    );
  }

  const visible = local.filter((question) => !question._removed);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Parsed Questions — {visible.length} ready to save</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {visible.map((question, idx) => (
            <Card key={question._id} className="border">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Question {idx + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => remove(question._id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Question Text</p>
                  <Textarea
                    className="min-h-[60px] text-xs font-mono"
                    value={question.question_text}
                    onChange={(e) =>
                      updateField(question._id, "question_text", e.target.value)
                    }
                    placeholder="Question text (LaTeX supported)"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Type</p>
                    <Select
                      value={question.question_type}
                      onValueChange={(value) =>
                        updateField(question._id, "question_type", value)
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MCQ">MCQ</SelectItem>
                        <SelectItem value="TRUE_FALSE">True/False</SelectItem>
                        <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                        <SelectItem value="NUMERICAL">Numerical</SelectItem>
                        <SelectItem value="CODING">Coding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Difficulty</p>
                    <Select
                      value={question.difficulty}
                      onValueChange={(value) =>
                        updateField(question._id, "difficulty", value)
                      }
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

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Subject</p>
                    <Input
                      className="h-7 text-xs"
                      value={question.subject}
                      onChange={(e) =>
                        updateField(question._id, "subject", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Topic</p>
                    <Input
                      className="h-7 text-xs"
                      value={question.topic}
                      onChange={(e) => updateField(question._id, "topic", e.target.value)}
                    />
                  </div>
                </div>

                {question.question_type === "MCQ" && Array.isArray(question.options) && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Options</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {question.options.map((option, optionIndex) => (
                        <div key={option.label} className="flex items-center gap-1.5">
                          <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">
                            {option.label}.
                          </span>
                          <Input
                            className="h-7 text-xs"
                            value={option.text}
                            onChange={(e) => {
                              const options = [...(question.options ?? [])];
                              options[optionIndex] = {
                                ...options[optionIndex],
                                text: e.target.value,
                              };
                              updateField(question._id, "options", options);
                            }}
                            placeholder={`Option ${option.label}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Correct Answer</p>
                    <Input
                      className="h-7 text-xs"
                      value={question.correct_answer}
                      onChange={(e) =>
                        updateField(question._id, "correct_answer", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Exam Type</p>
                    <Select
                      value={question.exam_type ?? "none"}
                      onValueChange={(value) =>
                        updateField(question._id, "exam_type", value === "none" ? null : value)
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="(none)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {EXAM_TYPES.map((examType) => (
                          <SelectItem key={examType} value={examType}>
                            {examType}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {visible.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">All questions removed.</p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSaveAll(local)} disabled={saving || visible.length === 0}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save {visible.length} Question{visible.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PDFImportTab({ onImported }: { onImported: (count: number) => void }) {
  const user = useAuthStore((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
  }

  async function processFile(file: File) {
    if (!user?.id) {
      toast.error("Please log in first.");
      return;
    }

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
      const formData = new FormData();
      formData.append("pdf", file);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error("Not authenticated.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-question-pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const responseJson = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          responseJson?.error || responseJson?.message || "Parse failed";
        throw new Error(message);
      }

      if (responseJson?.success === false || responseJson?.error) {
        throw new Error(responseJson?.error ?? "Parse failed");
      }

      const payload = responseJson?.data ?? responseJson;
      const questions = Array.isArray(payload?.questions) ? payload.questions : [];
      const parseSummary = payload?.summary;

      if (questions.length === 0) {
        throw new Error("No questions found in this PDF.");
      }

      const items: ReviewItem[] = (questions as ParsedQuestion[]).map((question, index) => ({
        ...question,
        _id: `q_${Date.now()}_${index}`,
        _removed: false,
      }));

      setReviewItems(items);
      setSummary(parseSummary ?? `${items.length} questions parsed.`);
    } catch (error) {
      console.error("[PDFImportTab] parse error:", error);
      const message = error instanceof Error ? error.message : "Failed to parse PDF.";
      setParseError(message);
      toast.error(message);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSaveAll(items: ReviewItem[]) {
    if (!user?.id) {
      toast.error("Please log in first.");
      return;
    }

    const toSave = items.filter((q) => !q._removed);
    if (toSave.length === 0) return;

    setSaving(true);

    try {
      const rows = toSave.map((question) => ({
        question_text: question.question_text,
        question_type: question.question_type,
        options: question.question_type === "MCQ" ? question.options : null,
        correct_answer: question.correct_answer,
        explanation: question.explanation,
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        marks_positive: question.marks_positive,
        marks_negative: question.marks_negative,
        source_year: question.source_year,
        exam_type: normalizeExamTypeForStorage(question.exam_type),
        latex_present: question.latex_present,
        uploaded_by: user.id,
        source: "USER_UPLOAD",
        is_public: false,
        is_verified: false,
      }));

      await questionsDB.createMany(rows);

      toast.success(summary ?? `${toSave.length} questions saved.`);
      setReviewItems(null);
      setSummary(null);
      onImported(toSave.length);
    } catch (error) {
      console.error("[PDFImportTab] save error:", error);
      toast.error("Failed to save questions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50 hover:bg-muted/10"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
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
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium text-foreground">Parsing PDF with AI…</p>
            <p className="text-sm text-muted-foreground">This may take 15–30 seconds.</p>
          </div>
        ) : (
          <>
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">Drop your PDF here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse · Max 10 MB
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Supports JEE, NEET, UPSC, SSC, IBPS papers and more
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

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Each PDF import costs <strong>5 credits</strong>. The AI will extract
          questions automatically and let you review before saving.
        </span>
      </div>

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

export default function UploadQuestions() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = useMemo(
    () => (searchParams.get("tab") === "manual" ? "manual" : "excel"),
    [searchParams]
  );

  const [questionCount, setQuestionCount] = useState(0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import Questions"
        description="Upload questions via Excel, PDF, or create them manually."
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="excel">
            <Upload className="mr-2 h-4 w-4" />
            Excel Import
          </TabsTrigger>
          <TabsTrigger value="pdf">
            <Upload className="mr-2 h-4 w-4" />
            PDF Import (Beta)
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Plus className="mr-2 h-4 w-4" />
            Create Manually
          </TabsTrigger>
        </TabsList>

        <TabsContent value="excel" className="mt-5">
          <ExcelImportTab onImported={(count) => setQuestionCount((prev) => prev + count)} />
        </TabsContent>

        <TabsContent value="pdf" className="mt-5 space-y-4">
          <PDFImportTab onImported={(count) => setQuestionCount((prev) => prev + count)} />
        </TabsContent>

        <TabsContent value="manual" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create a Question</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualCreator onSaved={() => setQuestionCount((prev) => prev + 1)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {questionCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span>
              {questionCount} question{questionCount !== 1 ? "s" : ""} added this session.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app/mock-test/my-questions")}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            View My Bank
          </Button>
        </div>
      )}
    </div>
  );
}
