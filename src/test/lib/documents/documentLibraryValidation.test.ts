import { describe, expect, it } from "vitest";
import {
  LIBRARY_ACCEPT_LABEL,
  RESUME_ACCEPT_LABEL,
  UNSUPPORTED_FORMAT_MESSAGE,
  validateDocumentFile,
} from "@/lib/documents/uploadValidation";

function fakeFile(name: string, type: string, size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("document upload validation [T-13]", () => {
  it("accepts library PDF/DOCX/TXT", () => {
    expect(validateDocumentFile(fakeFile("a.pdf", "application/pdf"), "library")).toBeNull();
    expect(
      validateDocumentFile(
        fakeFile("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "library",
      ),
    ).toBeNull();
    expect(validateDocumentFile(fakeFile("a.txt", "text/plain"), "library")).toBeNull();
  });

  it("rejects images and legacy DOC with unsupported message", () => {
    expect(validateDocumentFile(fakeFile("photo.png", "image/png"), "library")).toBe(
      UNSUPPORTED_FORMAT_MESSAGE,
    );
    expect(validateDocumentFile(fakeFile("old.doc", "application/msword"), "resume")).toBe(
      UNSUPPORTED_FORMAT_MESSAGE,
    );
  });

  it("rejects empty files", () => {
    expect(validateDocumentFile(fakeFile("empty.pdf", "application/pdf", 0), "library")).toMatch(
      /empty/i,
    );
  });

  it("advertises formats without DOC", () => {
    expect(LIBRARY_ACCEPT_LABEL).not.toMatch(/\bDOC\b/);
    expect(RESUME_ACCEPT_LABEL).not.toMatch(/\bDOC\b/);
  });
});
