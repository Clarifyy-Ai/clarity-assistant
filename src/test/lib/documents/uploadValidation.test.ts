import { describe, expect, it } from "vitest";
import { validateDocumentFile } from "@/lib/documents/uploadValidation";

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("document upload validation", () => {
  it("rejects empty files and invalid filename lengths", () => {
    expect(validateDocumentFile(file("resume.pdf", "application/pdf", 0), "resume")).toContain("empty");
    expect(
      validateDocumentFile(file(`${"a".repeat(181)}.pdf`, "application/pdf"), "resume"),
    ).toContain("180");
  });

  it("requires extension and matching MIME", () => {
    expect(validateDocumentFile(file("resume", "application/pdf"), "resume")).toMatch(
      /unsupported file format/i,
    );
    expect(validateDocumentFile(file("resume.pdf", "text/plain"), "resume")).toContain("MIME");
  });

  it("accepts supported document categories", () => {
    expect(validateDocumentFile(file("resume.pdf", "application/pdf"), "resume")).toBeNull();
    expect(validateDocumentFile(file("data.csv", "text/csv"), "spreadsheet")).toBeNull();
    expect(
      validateDocumentFile(
        file(
          "resume.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        "library",
      ),
    ).toBeNull();
  });

  it("rejects exam_document and library files over the 20 MB Edge ceiling", () => {
    const oversize = 20 * 1024 * 1024 + 1;
    expect(
      validateDocumentFile(file("exam.pdf", "application/pdf", oversize), "exam_document"),
    ).toMatch(/Maximum size is 20 MB/i);
    expect(
      validateDocumentFile(file("lib.pdf", "application/pdf", oversize), "library"),
    ).toMatch(/Maximum size is 20 MB/i);
    expect(
      validateDocumentFile(file("ok.pdf", "application/pdf", 20 * 1024 * 1024), "exam_document"),
    ).toBeNull();
  });
});
