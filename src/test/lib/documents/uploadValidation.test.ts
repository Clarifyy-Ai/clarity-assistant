import { describe, expect, it } from "vitest";
import { inspectDocumentFile, validateDocumentFile } from "@/lib/documents/uploadValidation";

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

function fileWithBytes(name: string, type: string, bytes: Uint8Array): File {
  const f = new File([bytes], name, { type });
  Object.defineProperty(f, "arrayBuffer", {
    value: async () => Uint8Array.from(bytes).buffer,
  });
  return f;
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

  it("accepts PDF/DOCX/TXT for job descriptions and cover letters", () => {
    expect(validateDocumentFile(file("jd.pdf", "application/pdf"), "job_description")).toBeNull();
    expect(validateDocumentFile(file("cover.txt", "text/plain"), "cover_letter")).toBeNull();
    expect(
      validateDocumentFile(
        file("jd.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "job_description",
      ),
    ).toMatch(/unsupported/i);
    expect(
      validateDocumentFile(file("cover.doc", "application/msword"), "cover_letter"),
    ).toMatch(/unsupported/i);
  });

  it("rejects files whose magic bytes do not match the extension", async () => {
    const fakePdf = fileWithBytes("jd.pdf", "application/pdf", new TextEncoder().encode("not-a-pdf-file"));
    const inspected = await inspectDocumentFile(fakePdf, "job_description");
    expect(inspected.error).toMatch(/corrupt|does not match/i);
  });

  it("accepts a PDF whose bytes start with %PDF", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25]);
    const genuine = fileWithBytes("cover.pdf", "application/pdf", bytes);
    const inspected = await inspectDocumentFile(genuine, "cover_letter");
    expect(inspected.error).toBeNull();
    expect(inspected.bytes?.byteLength).toBe(bytes.byteLength);
  });
});
