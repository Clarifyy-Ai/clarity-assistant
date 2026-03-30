// src/pages/app/mock-test/ExcelImportTab.tsx
import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "sonner";

interface ParsedRow {
  _idx: number;
  _error?: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: string;
  marks_positive: number;
  marks_negative: number;
  exam_type: string;
  source_year: number | null;
  question_type: string;
}

const VALID_ANSWERS = ["A", "B", "C", "D"];
const VALID_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const VALID_TYPES = ["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER", "CODING"];

function validateRow(row: ParsedRow): string | null {
  if (!row.question_text?.trim()) return "Question text is empty";

  if (row.question_type === "MCQ") {
    if (!VALID_ANSWERS.includes(row.correct_answer?.toUpperCase())) {
      return `Correct answer must be A/B/C/D, got "${row.correct_answer}"`;
    }
    if (!row.option_a?.trim() || !row.option_b?.trim()) {
      return "MCQ needs at least options A and B";
    }
  }

  return null;
}

function normalizeRow(raw: Record<string, unknown>, idx: number): ParsedRow {
  const sourceYearRaw = raw["Source_Year"] ?? raw["source_year"];
  const sourceYearNumber = Number(sourceYearRaw);

  const row: ParsedRow = {
    _idx: idx + 2,
    question_text: String(raw["Question_Text"] ?? raw["question_text"] ?? "").trim(),
    option_a: String(raw["Option_A"] ?? raw["option_a"] ?? "").trim(),
    option_b: String(raw["Option_B"] ?? raw["option_b"] ?? "").trim(),
    option_c: String(raw["Option_C"] ?? raw["option_c"] ?? "").trim(),
    option_d: String(raw["Option_D"] ?? raw["option_d"] ?? "").trim(),
    correct_answer: String(raw["Correct_Answer"] ?? raw["correct_answer"] ?? "")
      .trim()
      .toUpperCase(),
    explanation: String(raw["Explanation"] ?? raw["explanation"] ?? "").trim(),
    subject: String(raw["Subject"] ?? raw["subject"] ?? "General").trim(),
    topic: String(raw["Topic"] ?? raw["topic"] ?? "General").trim(),
    difficulty: String(raw["Difficulty"] ?? raw["difficulty"] ?? "MEDIUM")
      .trim()
      .toUpperCase(),
    marks_positive: Number(raw["Marks_Positive"] ?? raw["marks_positive"] ?? 4) || 4,
    marks_negative: Number(raw["Marks_Negative"] ?? raw["marks_negative"] ?? 1) || 1,
    exam_type: String(raw["Exam_Type"] ?? raw["exam_type"] ?? "CUSTOM")
      .trim()
      .toUpperCase(),
    source_year: Number.isFinite(sourceYearNumber) ? sourceYearNumber : null,
    question_type: String(raw["Question_Type"] ?? raw["question_type"] ?? "MCQ")
      .trim()
      .toUpperCase(),
  };

  if (!VALID_DIFFICULTIES.includes(row.difficulty)) row.difficulty = "MEDIUM";
  if (!VALID_TYPES.includes(row.question_type)) row.question_type = "MCQ";

  return row;
}

export default function ExcelImportTab({
  onImported,
}: {
  onImported: (count: number) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [errors, setErrors] = useState<ParsedRow[]>([]);
  const [saving, setSaving] = useState(false);

  function processFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5 MB.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(ext ?? "")) {
      toast.error("Only .xlsx or .xls files are supported.");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: "",
        });

        const validRows: ParsedRow[] = [];
        const invalidRows: ParsedRow[] = [];

        json.forEach((raw, idx) => {
          const row = normalizeRow(raw, idx);
          const validationError = validateRow(row);

          if (validationError) {
            row._error = validationError;
            invalidRows.push(row);
          } else {
            validRows.push(row);
          }
        });

        setParsed(validRows);
        setErrors(invalidRows);

        if (validRows.length === 0 && invalidRows.length === 0) {
          toast.error("No data rows found in the file.");
        } else {
          toast.success(
            `${validRows.length} questions parsed, ${invalidRows.length} skipped.`
          );
        }
      } catch (error) {
        console.error("[ExcelImport] parse error:", error);
        toast.error("Failed to parse Excel file.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function updateField(idx: number, key: keyof ParsedRow, value: string) {
    setParsed((prev) => {
      if (!prev) return null;
      return prev.map((row) =>
        row._idx === idx ? { ...row, value } : row
      );
    });
  }

  function removeRow(idx: number) {
    setParsed((prev) => prev?.filter((row) => row._idx !== idx) ?? null);
  }

  async function handleSave() {
    if (!parsed?.length || !user?.id) {
      toast.error("No valid rows to save.");
      return;
    }

    setSaving(true);

    try {
      for (const row of parsed) {
        const error = validateRow(row);
        if (error) {
          throw new Error(`Row ${row._idx}: ${error}`);
        }
      }

      const rows = parsed.map((row) => ({
        question_text: row.question_text,
        question_type: row.question_type,
        options:
          row.question_type === "MCQ"
            ? [
                { label: "A", text: row.option_a },
                { label: "B", text: row.option_b },
                { label: "C", text: row.option_c },
                { label: "D", text: row.option_d },
              ]
            : null,
        correct_answer: row.correct_answer,
        explanation: row.explanation,
        subject: row.subject,
        topic: row.topic || "General",
        difficulty: row.difficulty,
        marks_positive: row.marks_positive,
        marks_negative: row.marks_negative,
        exam_type: row.exam_type === "CUSTOM" ? null : row.exam_type,
        source_year: row.source_year,
        latex_present:
          /\$|\\\(|\\\[/.test(row.question_text) ||
          /\$|\\\(|\\\[/.test(row.explanation),
        uploaded_by: user.id,
        source: "USER_UPLOAD",
        is_public: false,
        is_verified: false,
      }));

      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const { error } = await supabase.from("questions").insert(chunk);
        if (error) throw error;
      }

      toast.success(`${rows.length} questions imported successfully.`);
      onImported(rows.length);
      setParsed(null);
      setErrors([]);
    } catch (error) {
      console.error("[ExcelImport] save error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save questions. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Download Template</p>
          <p className="text-xs text-muted-foreground">
            Pre-formatted Excel file with headers
          </p>
        </div>
        /ClarifyAI_Question_Template.xlsx
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-4 w-4" />
            Template
          </Button>
        </a>
      </div>

      {!parsed && (
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
            dragging
              ? "border-violet-500 bg-violet-500/10"
              : "border-border hover:border-violet-500/50 hover:bg-muted/10"
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
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            }}
          />
          <FileSpreadsheet className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">Drop your Excel file here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse · .xlsx/.xls · Max 5 MB
          </p>
        </div>
      )}

      {parsed && parsed.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {parsed.length} questions ready
                {errors.length > 0 && (
                  <span className="ml-2 text-amber-400">({errors.length} skipped)</span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setParsed(null);
                    setErrors([]);
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save to Question Bank
                </Button>
              </div>
            </div>

            <div className="max-h-[500px] overflow-auto rounded-lg border border-border">
              <table className="w-full whitespace-nowrap text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted/80 shadow-sm">
                  <tr>
                    <th className="border-b border-border px-3 py-2 font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="min-w-[250px] border-b border-border px-3 py-2 font-medium text-muted-foreground">
                      Question <Pencil className="ml-1 inline h-3 w-3" />
                    </th>
                    <th className="border-b border-border px-3 py-2 font-medium text-muted-foreground">
                      Subject <Pencil className="ml-1 inline h-3 w-3" />
                    </th>
                    <th className="border-b border-border px-3 py-2 font-medium text-muted-foreground">
                      Topic <Pencil className="ml-1 inline h-3 w-3" />
                    </th>
                    <th className="border-b border-border px-3 py-2 font-medium text-muted-foreground">
                      Diff <Pencil className="ml-1 inline h-3 w-3" />
                    </th>
                    <th className="border-b border-border px-3 py-2 font-medium text-muted-foreground">
                      Ans <Pencil className="ml-1 inline h-3 w-3" />
                    </th>
                    <th className="border-b border-border px-3 py-2 text-center font-medium text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.map((row, index) => (
                    <tr key={row._idx} className="group transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-1">
                        <input
                          type="text"
                          value={row.question_text}
                          onChange={(e) =>
                            updateField(row._idx, "question_text", e.target.value)
                          }
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-foreground outline-none transition-all hover:border-border focus:border-primary focus:bg-background"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="text"
                          value={row.subject}
                          onChange={(e) =>
                            updateField(row._idx, "subject", e.target.value)
                          }
                          className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-foreground outline-none transition-all hover:border-border focus:border-primary focus:bg-background"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="text"
                          value={row.topic}
                          onChange={(e) =>
                            updateField(row._idx, "topic", e.target.value)
                          }
                          className="w-28 rounded border border-transparent bg-transparent px-2 py-1 text-foreground outline-none transition-all hover:border-border focus:border-primary focus:bg-background"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <select
                          value={row.difficulty}
                          onChange={(e) =>
                            updateField(row._idx, "difficulty", e.target.value)
                          }
                          className={`rounded border border-transparent bg-transparent px-1 py-1 text-[10px] font-semibold outline-none transition-all hover:border-border focus:border-primary focus:bg-background ${
                            row.difficulty === "HARD"
                              ? "text-red-500"
                              : row.difficulty === "EASY"
                              ? "text-green-500"
                              : "text-amber-500"
                          }`}
                        >
                          <option value="EASY">EASY</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HARD">HARD</option>
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <input
                          type="text"
                          value={row.correct_answer}
                          onChange={(e) =>
                            updateField(
                              row._idx,
                              "correct_answer",
                              e.target.value.toUpperCase()
                            )
                          }
                          className="w-12 rounded border border-transparent bg-transparent px-2 py-1 text-center font-mono font-bold text-foreground outline-none transition-all hover:border-border focus:border-primary focus:bg-background"
                          maxLength={1}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row._idx)}
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        >
                          <X className="mx-auto h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {errors.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-500">
              <AlertCircle className="h-4 w-4" />
              {errors.length} rows skipped (fix in Excel and re-upload)
            </p>
            <div className="max-h-[150px] space-y-1 overflow-auto text-xs">
              {errors.map((row) => (
                <p key={row._idx} className="text-muted-foreground">
                  <span className="font-mono font-medium text-amber-500">
                    Row {row._idx}:
                  </span>{" "}
                  {row._error}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
