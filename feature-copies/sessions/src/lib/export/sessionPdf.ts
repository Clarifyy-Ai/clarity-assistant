import { jsPDF } from "jspdf";

type SessionPdfInput = {
  title: string;
  dateLabel: string;
  overallScore?: number | null;
  durationLabel?: string;
  aiFeedback?: string | null;
  answers?: Array<{
    question_text?: string;
    transcript?: string;
    score?: number | null;
  }>;
};

/** Export a session scorecard summary to PDF (client-side via jsPDF). */
export function exportSessionPdf(input: SessionPdfInput): void {
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

  addLine(input.title, 16, true);
  addLine(input.dateLabel, 10);
  if (input.overallScore != null) addLine(`Overall score: ${input.overallScore}`, 12, true);
  if (input.durationLabel) addLine(`Duration: ${input.durationLabel}`, 10);
  y += 8;

  if (input.aiFeedback) {
    addLine("AI feedback", 12, true);
    addLine(input.aiFeedback, 10);
    y += 8;
  }

  if (input.answers?.length) {
    addLine("Question review", 12, true);
    input.answers.forEach((ans, i) => {
      addLine(`${i + 1}. ${ans.question_text ?? "Question"}`, 10, true);
      if (ans.score != null) addLine(`Score: ${ans.score}`, 9);
      if (ans.transcript) addLine(ans.transcript, 10);
      y += 6;
    });
  }

  const slug = input.title.replace(/[^\w\-]+/g, "-").slice(0, 40);
  doc.save(`clarify-session-${slug || "export"}.pdf`);
}
