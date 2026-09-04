/**
 * Export serializers for Settings → Data & Export.
 * Tabular types → CSV; full dump stays JSON. Never label JSON as PDF.
 */

import { brandExportBasename } from "@/lib/constants/brandStorage";

export type TabularExportType = "sessions" | "transcripts" | "answers" | "interviews";
export type ExportType = TabularExportType | "full";

export const TABULAR_EXPORT_TYPES: readonly TabularExportType[] = [
  "sessions",
  "transcripts",
  "answers",
  "interviews",
] as const;

export function isTabularExportType(type: string): type is TabularExportType {
  return (TABULAR_EXPORT_TYPES as readonly string[]).includes(type);
}

export function exportMimeForType(type: string): string {
  return isTabularExportType(type) ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
}

export function exportFilenameForType(type: string, dateIsoDay = new Date().toISOString().slice(0, 10)): string {
  const ext = isTabularExportType(type) ? "csv" : "json";
  return `${brandExportBasename(type, dateIsoDay)}.${ext}`;
}

export function exportFormatBadge(type: string): "CSV" | "JSON" {
  return isTabularExportType(type) ? "CSV" : "JSON";
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Record<string, unknown>[], preferredColumns?: string[]): string {
  if (rows.length === 0) {
    const cols = preferredColumns ?? [];
    return cols.length ? `${cols.join(",")}\n` : "";
  }
  const cols =
    preferredColumns && preferredColumns.length > 0
      ? preferredColumns
      : Object.keys(rows[0] ?? {});
  const lines = [
    cols.join(","),
    ...rows.map((row) => cols.map((c) => csvEscape(row[c])).join(",")),
  ];
  return lines.join("\n");
}

function asRecordRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

function flattenSessionRow(row: Record<string, unknown>): Record<string, unknown> {
  const metrics =
    row.metrics && typeof row.metrics === "object"
      ? (row.metrics as Record<string, unknown>)
      : {};
  return {
    id: row.id ?? "",
    session_type: row.session_type ?? "",
    title: row.title ?? "",
    created_at: row.created_at ?? "",
    started_at: row.started_at ?? "",
    completed_at: row.completed_at ?? "",
    duration_seconds: row.duration_seconds ?? "",
    status: row.status ?? "",
    score: row.score ?? "",
    filler_words: metrics.filler_words ?? "",
    avg_wpm: metrics.avg_wpm ?? "",
    confidence_score: metrics.confidence_score ?? "",
    clarity_score: metrics.clarity_score ?? "",
    question_count: metrics.question_count ?? "",
    summary: row.summary ?? "",
  };
}

export function toSessionsCsv(payload: unknown): string {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rows = asRecordRows(root.sessions).map(flattenSessionRow);
  return rowsToCsv(rows, [
    "id",
    "session_type",
    "title",
    "created_at",
    "started_at",
    "completed_at",
    "duration_seconds",
    "status",
    "score",
    "filler_words",
    "avg_wpm",
    "confidence_score",
    "clarity_score",
    "question_count",
    "summary",
  ]);
}

export function toTranscriptsCsv(payload: unknown): string {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rows = asRecordRows(root.transcripts).map((row) => ({
    id: row.id ?? "",
    session_id: row.session_id ?? "",
    speaker: row.speaker ?? "",
    content: row.content ?? "",
    confidence: row.confidence ?? "",
    wpm: row.wpm ?? "",
    filler_count: row.filler_count ?? "",
    language: row.language ?? "",
    created_at: row.created_at ?? "",
  }));
  return rowsToCsv(rows, [
    "id",
    "session_id",
    "speaker",
    "content",
    "confidence",
    "wpm",
    "filler_count",
    "language",
    "created_at",
  ]);
}

export function toAnswersCsv(payload: unknown): string {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const bank = asRecordRows(root.answer_bank);
  const answers = asRecordRows(root.answers);
  const rows = (bank.length > 0 ? bank : answers).map((row) => ({
    id: row.id ?? "",
    question: row.question_text ?? row.question ?? "",
    answer: row.answer_text ?? row.answer ?? "",
    score: row.score ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  }));
  return rowsToCsv(rows, ["id", "question", "answer", "score", "created_at", "updated_at"]);
}

export function toInterviewsCsv(payload: unknown): string {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rows = asRecordRows(root.interviews).map((row) => ({
    id: row.id ?? "",
    company: row.company ?? row.company_name ?? "",
    role: row.role ?? row.job_title ?? "",
    scheduled_at: row.scheduled_at ?? row.interview_at ?? row.starts_at ?? "",
    status: row.status ?? "",
    location: row.location ?? "",
    notes: row.notes ?? "",
    created_at: row.created_at ?? "",
  }));
  return rowsToCsv(rows, [
    "id",
    "company",
    "role",
    "scheduled_at",
    "status",
    "location",
    "notes",
    "created_at",
  ]);
}

export function serializeExportDownload(
  type: string,
  payload: unknown,
): { blob: Blob; filename: string; mime: string; format: "CSV" | "JSON" } {
  const mime = exportMimeForType(type);
  const filename = exportFilenameForType(type);
  const format = exportFormatBadge(type);

  if (type === "sessions") {
    return { blob: new Blob([toSessionsCsv(payload)], { type: mime }), filename, mime, format };
  }
  if (type === "transcripts") {
    return { blob: new Blob([toTranscriptsCsv(payload)], { type: mime }), filename, mime, format };
  }
  if (type === "answers") {
    return { blob: new Blob([toAnswersCsv(payload)], { type: mime }), filename, mime, format };
  }
  if (type === "interviews") {
    return { blob: new Blob([toInterviewsCsv(payload)], { type: mime }), filename, mime, format };
  }

  const json = JSON.stringify(payload, null, 2);
  return {
    blob: new Blob([json], { type: mime }),
    filename,
    mime,
    format,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  try {
    if (!url.startsWith("blob:")) {
      throw new Error("Export download must use a blob: URL (no mixed content).");
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
