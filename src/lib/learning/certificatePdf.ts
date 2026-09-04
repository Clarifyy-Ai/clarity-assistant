/**
 * On-demand course completion certificate PDF.
 * Uses only public verification fields — never user_id / course_id / internal UUIDs.
 * Distinct from verify RPC: verification validates; this module renders a downloadable file.
 */

import { jsPDF } from "jspdf";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  type CertificateRecord,
  certificateKindLabel,
  formatCertificateDate,
  verificationPath,
} from "@/lib/learning/certificates";

export type CertificatePdfInput = Pick<
  CertificateRecord,
  | "certificate_code"
  | "student_name"
  | "course_name"
  | "issued_at"
  | "course_duration_hours"
  | "completion_percentage"
> & {
  kind?: string;
  /** Origin for absolute verify URL when available (e.g. window.location.origin). */
  verifyOrigin?: string | null;
};

export function buildCertificatePdfFilename(certificateCode: string): string {
  const safe = certificateCode.replace(/[^\w\-]+/g, "-").toUpperCase();
  return `CareerPilot-Certificate-${safe || "UNKNOWN"}.pdf`;
}

/** Build a landscape A4 certificate PDF document (does not save). */
export function buildCertificatePdf(input: CertificatePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // Outer frame
  doc.setDrawColor(30, 64, 120);
  doc.setLineWidth(2.5);
  doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);

  // Inner frame
  doc.setLineWidth(0.75);
  doc.setDrawColor(100, 130, 170);
  doc.rect(margin + 10, margin + 10, pageW - margin * 2 - 20, pageH - margin * 2 - 20);

  const centerX = pageW / 2;
  let y = margin + 56;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 90, 110);
  doc.text(PRODUCT_NAMES.brand.toUpperCase(), centerX, y, { align: "center" });

  y += 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(20, 30, 50);
  doc.text(input.kind?.trim() || certificateKindLabel(), centerX, y, { align: "center" });

  y += 36;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(90, 100, 120);
  doc.text("This is to certify that", centerX, y, { align: "center" });

  y += 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(15, 25, 45);
  doc.text(String(input.student_name || "Learner"), centerX, y, { align: "center" });

  y += 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(90, 100, 120);
  doc.text("has successfully completed", centerX, y, { align: "center" });

  y += 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 40, 80);
  const courseLines = doc.splitTextToSize(String(input.course_name || "Course"), pageW - margin * 2 - 80);
  doc.text(courseLines, centerX, y, { align: "center" });
  y += courseLines.length * 20 + 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(50, 60, 80);
  const meta: string[] = [];
  if (input.issued_at) {
    meta.push(`Completed ${formatCertificateDate(input.issued_at)}`);
  }
  const hours = input.course_duration_hours;
  if (hours != null && Number.isFinite(Number(hours))) {
    meta.push(`${Number(hours)} hours`);
  }
  if (input.completion_percentage != null && Number.isFinite(Number(input.completion_percentage))) {
    meta.push(`${Math.round(Number(input.completion_percentage))}% complete`);
  }
  if (meta.length) {
    doc.text(meta.join("  ·  "), centerX, y, { align: "center" });
    y += 22;
  }

  doc.setFontSize(10);
  doc.setTextColor(70, 80, 100);
  doc.text(`Certificate ID: ${input.certificate_code}`, centerX, y, { align: "center" });
  y += 16;

  const path = verificationPath(input.certificate_code);
  const origin = (input.verifyOrigin ?? "").replace(/\/$/, "");
  const verifyUrl = origin ? `${origin}${path}` : path;
  doc.setFontSize(9);
  doc.setTextColor(100, 110, 130);
  doc.text(`Verify at ${verifyUrl}`, centerX, y, { align: "center" });

  // Footer disclaimer
  doc.setFontSize(8);
  doc.setTextColor(120, 125, 135);
  doc.text(
    "Course completion record from Career Pilot. Not an accredited professional license or board certification.",
    centerX,
    pageH - margin - 22,
    { align: "center" },
  );

  return doc;
}

/** Download a formatted PDF from an authoritative public certificate record. */
export function downloadCertificatePdf(input: CertificatePdfInput): string {
  const filename = buildCertificatePdfFilename(input.certificate_code);
  const doc = buildCertificatePdf({
    ...input,
    verifyOrigin:
      input.verifyOrigin ??
      (typeof window !== "undefined" ? window.location.origin : null),
  });
  doc.save(filename);
  return filename;
}

/** Convert verified RPC payload into PDF input; returns null if incomplete. */
export function certificatePdfInputFromVerifyPayload(payload: {
  valid?: boolean;
  certificate_code?: string;
  student_name?: string;
  course_name?: string;
  issued_at?: string;
  course_duration_hours?: number | null;
  completion_percentage?: number;
  kind?: string;
}): CertificatePdfInput | null {
  if (!payload?.valid) return null;
  const code = payload.certificate_code?.trim();
  const student = payload.student_name?.trim();
  const course = payload.course_name?.trim();
  if (!code || !student || !course) return null;
  return {
    certificate_code: code,
    student_name: student,
    course_name: course,
    issued_at: payload.issued_at ?? new Date().toISOString(),
    course_duration_hours: payload.course_duration_hours ?? null,
    completion_percentage: Number(payload.completion_percentage ?? 0),
    kind: payload.kind,
  };
}
