import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildCertificatePdfFilename,
  certificatePdfInputFromVerifyPayload,
  downloadCertificatePdf,
} from "@/lib/learning/certificatePdf";

const saveMock = vi.hoisted(() => vi.fn());
const textMock = vi.hoisted(() => vi.fn());
const splitTextToSizeMock = vi.hoisted(() => vi.fn((t: string) => [t]));

vi.mock("jspdf", () => {
  return {
    jsPDF: class {
      internal = {
        pageSize: {
          getWidth: () => 842,
          getHeight: () => 595,
        },
      };
      setDrawColor = vi.fn();
      setLineWidth = vi.fn();
      rect = vi.fn();
      setFont = vi.fn();
      setFontSize = vi.fn();
      setTextColor = vi.fn();
      text = textMock;
      splitTextToSize = splitTextToSizeMock;
      save = saveMock;
    },
  };
});

describe("certificatePdf", () => {
  beforeEach(() => {
    saveMock.mockReset();
    textMock.mockReset();
    splitTextToSizeMock.mockClear();
  });

  it("builds a stable CareerPilot filename from the certificate code", () => {
    expect(buildCertificatePdfFilename("CLR-2026-AB12CD34")).toBe(
      "CareerPilot-Certificate-CLR-2026-AB12CD34.pdf",
    );
    expect(buildCertificatePdfFilename("bad/code")).toBe(
      "CareerPilot-Certificate-BAD-CODE.pdf",
    );
  });

  it("maps a valid verify payload to public PDF fields only", () => {
    const input = certificatePdfInputFromVerifyPayload({
      valid: true,
      certificate_code: "CLR-2026-AB12CD34",
      student_name: "QA Audit",
      course_name: "Interview Foundations",
      issued_at: "2026-01-15T00:00:00.000Z",
      course_duration_hours: 12,
      completion_percentage: 100,
      kind: "Course Completion Certificate",
    });
    expect(input).toEqual({
      certificate_code: "CLR-2026-AB12CD34",
      student_name: "QA Audit",
      course_name: "Interview Foundations",
      issued_at: "2026-01-15T00:00:00.000Z",
      course_duration_hours: 12,
      completion_percentage: 100,
      kind: "Course Completion Certificate",
    });
    expect(input).not.toHaveProperty("user_id");
    expect(input).not.toHaveProperty("course_id");
  });

  it("returns null for invalid or incomplete verify payloads", () => {
    expect(certificatePdfInputFromVerifyPayload({ valid: false })).toBeNull();
    expect(
      certificatePdfInputFromVerifyPayload({
        valid: true,
        certificate_code: "CLR-2026-AB12CD34",
        student_name: "",
        course_name: "Course",
      }),
    ).toBeNull();
  });

  it("downloads a PDF with application/pdf filename via jsPDF.save", () => {
    const filename = downloadCertificatePdf({
      certificate_code: "CLR-2026-AB12CD34",
      student_name: "QA Audit",
      course_name: "Interview Foundations",
      issued_at: "2026-01-15T00:00:00.000Z",
      course_duration_hours: 12,
      completion_percentage: 100,
      verifyOrigin: "https://example.test",
    });
    expect(filename).toBe("CareerPilot-Certificate-CLR-2026-AB12CD34.pdf");
    expect(saveMock).toHaveBeenCalledWith(filename);
    const drawn = textMock.mock.calls.map((c) => String(c[0]));
    expect(drawn.some((t) => t.includes("QA Audit"))).toBe(true);
    expect(drawn.some((t) => t.includes("CLR-2026-AB12CD34"))).toBe(true);
    expect(drawn.some((t) => t.includes("user_id"))).toBe(false);
  });
});
