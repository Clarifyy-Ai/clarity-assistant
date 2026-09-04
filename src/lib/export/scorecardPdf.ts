import { jsPDF } from "jspdf";
import { brandExportBasename } from "@/lib/constants/brandStorage";
import type { Scorecard } from "@/types/scorecard.types";

export type ScorecardPdfResult = {
  filename: string;
  mimeType: "application/pdf";
  /** Raw PDF bytes as a string starting with %PDF (jsPDF output('arraybuffer') preferred in tests). */
  bytes: ArrayBuffer;
};

/** Build a real PDF from the authoritative Scorecard DTO (client-side jsPDF). */
export function buildScorecardPdf(
  scorecard: Scorecard,
  opts?: { sessionIdHint?: string },
): ScorecardPdfResult {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addLine = (text: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size + 6;
    }
  };

  const dateLabel = (() => {
    try {
      return new Date(scorecard.generated_at).toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return scorecard.generated_at;
    }
  })();

  addLine("Session Scorecard", 16, true);
  addLine(dateLabel, 10);
  if (scorecard.overall_score != null) {
    addLine(`Overall score: ${scorecard.overall_score}`, 12, true);
  }
  y += 8;

  addLine("Dimensions", 12, true);
  addLine(
    [
      `Clarity: ${scorecard.clarity_score ?? "—"}`,
      `Structure: ${scorecard.structure_score ?? "—"}`,
      `Relevance: ${scorecard.relevance_score ?? "—"}`,
      `Confidence: ${scorecard.confidence_score ?? "—"}`,
    ].join("  ·  "),
    10,
  );
  y += 8;

  if (scorecard.strengths?.length) {
    addLine("Strengths", 12, true);
    for (const s of scorecard.strengths) addLine(`• ${s}`, 10);
    y += 6;
  }

  if (scorecard.improvements?.length) {
    addLine("Areas to improve", 12, true);
    for (const s of scorecard.improvements) addLine(`• ${s}`, 10);
    y += 6;
  }

  if (scorecard.coach_note?.trim()) {
    addLine("Coach note", 12, true);
    addLine(scorecard.coach_note.trim(), 10);
    y += 6;
  }

  if (scorecard.question_scores?.length) {
    addLine("Question breakdown", 12, true);
    scorecard.question_scores.forEach((q, i) => {
      addLine(
        `${i + 1}. ${q.question_text || "Question"} (score: ${q.score ?? "—"})`,
        10,
        true,
      );
      if (q.key_strength) addLine(`Strength: ${q.key_strength}`, 9);
      if (q.key_weakness) addLine(`Improve: ${q.key_weakness}`, 9);
      if (q.coach_tip) addLine(`Tip: ${q.coach_tip}`, 9);
      y += 4;
    });
  }

  const idHint = (opts?.sessionIdHint ?? scorecard.session_id).slice(0, 8);
  const filename = `${brandExportBasename("scorecard", idHint)}.pdf`;
  const bytes = doc.output("arraybuffer");
  return { filename, mimeType: "application/pdf", bytes };
}

/** Download scorecard as application/pdf (never JSON). */
export function exportScorecardPdf(
  scorecard: Scorecard,
  opts?: { sessionIdHint?: string },
): ScorecardPdfResult {
  const result = buildScorecardPdf(scorecard, opts);
  const blob = new Blob([result.bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
  return result;
}
