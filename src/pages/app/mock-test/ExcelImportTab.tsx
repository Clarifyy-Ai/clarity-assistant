// @ts-nocheck
import { useState, useRef } from "react";
import { Upload, Download, Check, AlertCircle, Loader2, X, FileSpreadsheet, Pencil } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
const VALID_TYPES = ["MCQ", "TRUE_FALSE", "NUMERICAL"];

function validateRow(row: ParsedRow): string | null {
  if (!row.question_text?.trim()) return "Question text is empty";
  if (row.question_type === "MCQ" && !VALID_ANSWERS.includes(row.correct_answer?.toUpperCase()))
    return `Correct answer must be A/B/C/D, got "${row.correct_answer}"`;
  if (row.question_type === "MCQ" && (!row.option_a?.trim() || !row.option_b?.trim()))
    return "MCQ needs at least options A and B";
  return null;
}

export default function ExcelImportTab({ onImported }: { onImported: (count: number) => void }) {
  const user = useAuthStore((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [errors, setErrors] = useState<ParsedRow[]>([]);
  const [saving, setSaving] = useState(false);

  function processFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5 MB."); return; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(ext ?? "")) { toast.error("Only .xlsx or .xls files."); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

        const valid: ParsedRow[] = [];
        const invalid: ParsedRow[] = [];

        json.forEach((row, idx) => {
          const parsedRow: ParsedRow = {
            _idx: idx + 2,
            question_text: String(row["Question_Text"] ?? row["question_text"] ?? "").trim(),
            option_a: String(row["Option_A"] ?? row["option_a"] ?? "").trim(),
            option_b: String(row["Option_B"] ?? row["option_b"] ?? "").trim(),
            option_c: String(row["Option_C"] ?? row["option_c"] ?? "").trim(),
            option_d: String(row["Option_D"] ?? row["option_d"] ?? "").trim(),
            correct_answer: String(row["Correct_Answer"] ?? row["correct_answer"] ?? "").trim().toUpperCase(),
            explanation: String(row["Explanation"] ?? row["explanation"] ?? "").trim(),
            subject: String(row["Subject"] ?? row["subject"] ?? "General").trim(),
            topic: String(row["Topic"] ?? row["topic"] ?? "").trim(),
            difficulty: String(row["Difficulty"] ?? row["difficulty"] ?? "MEDIUM").trim().toUpperCase(),
            marks_positive: Number(row["Marks_Positive"] ?? row["marks_positive"] ?? 4) || 4,
            marks_negative: Number(row["Marks_Negative"] ?? row["marks_negative"] ?? 1) || 1,
            exam_type: String(row["Exam_Type"] ?? row["exam_type"] ?? "CUSTOM").trim().toUpperCase(),
            source_year: Number(row["Source_Year"] ?? row["source_year"]) || null,
            question_type: String(row["Question_Type"] ?? row["question_type"] ?? "MCQ").trim().toUpperCase(),
          };
          if (!VALID_DIFFICULTIES.includes(parsedRow.difficulty)) parsedRow.difficulty = "MEDIUM";
          if (!VALID_TYPES.includes(parsedRow.question_type)) parsedRow.question_type = "MCQ";

          const err = validateRow(parsedRow);
          if (err) {
            parsedRow._error = err;
            invalid.push(parsedRow);
          } else {
            valid.push(parsedRow);
          }
        });

        setParsed(valid);
        setErrors(invalid);
        if (valid.length === 0 && invalid.length === 0) toast.error("No data rows found in the file.");
        else toast.success(`${valid.length} questions parsed, ${invalid.length} skipped.`);
      } catch (err) {
        console.error("[ExcelImport] parse error:", err);
        toast.error("Failed to parse Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function updateField(idx: number, key: keyof ParsedRow, value: string) {
    setParsed((prev) => {
      if (!prev) return null;
      const updated = prev.map((r) => r._idx === idx ? { ...r, [key]: value } : r);
      // Re-validate the updated row
      const targetRow = updated.find(r => r._idx === idx);
      if (targetRow) {
          const err = validateRow(targetRow);
          if (err) toast.error(`Row ${idx} error: ${err}`);
      }
      return updated;
    });
  }

  function removeRow(idx: number) {
    setParsed((prev) => prev?.filter((r) => r._idx !== idx) ?? null);
  }

  async function handleSave() {
    if (!parsed?.length || !user?.id) return;
    setSaving(true);
    try {
      // Validate all rows before saving
      for (const r of parsed) {
          const err = validateRow(r);
          if (err) throw new Error(`Row ${r._idx}: ${err}`);
      }

      const rows = parsed.map((r) => ({
        question_text: r.question_text,
        question_type: r.question_type,
        options: r.question_type === "MCQ" ? [
          { label: "A", text: r.option_a },
          { label: "B", text: r.option_b },
          { label: "C", text: r.option_c },
          { label: "D", text: r.option_d },
        ] : null,
        correct_answer: r.correct_answer,
        explanation: r.explanation,
        subject: r.subject,
        topic: r.topic || "General",
        difficulty: r.difficulty,
        marks_positive: r.marks_positive,
        marks_negative: r.marks_negative,
        exam_type: r.exam_type === "CUSTOM" ? null : r.exam_type,
        source_year: r.source_year,
        latex_present: /\$/.test(r.question_text),
        uploaded_by: user.id,
        source: "USER_UPLOAD",
        is_public: false,
        is_verified: false,
      }));

      // Batch insert in chunks of 50
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const { error } = await supabase.from("questions").insert(chunk);
        if (error) throw error;
      }

      toast.success(`${rows.length} questions imported successfully!`);
      onImported(rows.length);
      setParsed(null);
      setErrors([]);
    } catch (err: any) {
      console.error("[ExcelImport] save error:", err);
      toast.error(err.message || "Failed to save questions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Download template */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Download Template</p>
          <p className="text-xs text-muted-foreground">Pre-formatted Excel file with headers</p>
        </div>
        <a href="/ClarifyAI_Question_Template.xlsx" download>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            Template
          </Button>
        </a>
      </div>

      {/* Drop zone */}
      {!parsed && (
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer",
            dragging ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-500/50 hover:bg-muted/10"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">Drop your Excel file here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse · .xlsx/.xls · Max 5 MB</p>
        </div>
      )}

      {/* Preview table with Inline Editing */}
      {parsed && parsed.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {parsed.length} questions ready
                {errors.length > 0 && <span className="text-amber-400 ml-2">({errors.length} skipped)</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setParsed(null); setErrors([]); }}>
                  <X className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  Save to Question Bank
                </Button>
              </div>
            </div>

            <div className="max-h-[500px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-muted/80 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border">#</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border min-w-[250px]">Question <Pencil className="inline w-3 h-3 ml-1" /></th>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border">Subject <Pencil className="inline w-3 h-3 ml-1" /></th>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border">Topic <Pencil className="inline w-3 h-3 ml-1" /></th>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border">Diff <Pencil className="inline w-3 h-3 ml-1" /></th>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border">Ans <Pencil className="inline w-3 h-3 ml-1" /></th>
                    <th className="px-3 py-2 font-medium text-muted-foreground border-b border-border text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.map((r, i) => (
                    <tr key={r._idx} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1">
                        <input 
                           type="text" 
                           value={r.question_text} 
                           onChange={(e) => updateField(r._idx, 'question_text', e.target.value)}
                           className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background px-2 py-1 rounded text-foreground outline-none transition-all"
                        />
                      </td>
                      <td className="px-3 py-1">
                         <input 
                           type="text" 
                           value={r.subject} 
                           onChange={(e) => updateField(r._idx, 'subject', e.target.value)}
                           className="w-24 bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background px-2 py-1 rounded text-foreground outline-none transition-all"
                        />
                      </td>
                      <td className="px-3 py-1">
                         <input 
                           type="text" 
                           value={r.topic} 
                           onChange={(e) => updateField(r._idx, 'topic', e.target.value)}
                           className="w-28 bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background px-2 py-1 rounded text-foreground outline-none transition-all"
                        />
                      </td>
                      <td className="px-3 py-1">
                         <select 
                           value={r.difficulty}
                           onChange={(e) => updateField(r._idx, 'difficulty', e.target.value)}
                           className={cn("bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background px-1 py-1 rounded outline-none font-semibold text-[10px]",
                              r.difficulty === "HARD" ? "text-red-500" : r.difficulty === "EASY" ? "text-green-500" : "text-amber-500"
                           )}
                         >
                            <option value="EASY">EASY</option>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="HARD">HARD</option>
                         </select>
                      </td>
                      <td className="px-3 py-1">
                         <input 
                           type="text" 
                           value={r.correct_answer} 
                           onChange={(e) => updateField(r._idx, 'correct_answer', e.target.value.toUpperCase())}
                           className="w-12 bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background px-2 py-1 rounded font-mono font-bold text-foreground outline-none transition-all text-center"
                           maxLength={1}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => removeRow(r._idx)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-4 w-4 mx-auto" />
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

      {/* Errors List */}
      {errors.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-500 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {errors.length} rows skipped (Please fix in Excel and re-upload)
            </p>
            <div className="max-h-[150px] overflow-auto text-xs space-y-1">
              {errors.map((e) => (
                <p key={e._idx} className="text-muted-foreground">
                  <span className="font-mono text-amber-500 font-medium">Row {e._idx}:</span> {e._error}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
