import { describe, expect, it } from "vitest";
import {
  assessExtractedDocumentQuality,
  extractJdFieldsFromText,
  looksLikeBinaryDump,
  looksLikeUploadedFilenameStub,
  normalizeSkillList,
} from "@/lib/documents/parseNormalize";
import { parseResumeContentString, normalizeParsedResume } from "@/lib/documents/resumeParse";
import {
  extractDocxXmlText,
  extractPdfTextBasic,
} from "../../../../supabase/functions/_shared/documentTextExtract.ts";

describe("skill normalization", () => {
  it("maps skill objects to strings and never String(object)", () => {
    expect(
      normalizeSkillList([
        { name: "React" },
        { skill: "TypeScript" },
        "Node.js",
        { foo: 1 },
        null,
      ]),
    ).toEqual(["React", "TypeScript", "Node.js"]);
    expect(normalizeParsedResume({ skills: [{ name: "Go" }, { label: "SQL" }] })?.skills).toEqual([
      "Go",
      "SQL",
    ]);
  });
});

describe("malformed and unrelated documents", () => {
  it("rejects PDF binary dumps", () => {
    const dump = "%PDF-1.4\n1 0 obj\n<< /Length 4 >>\nstream\n\u0000\u0001\u0002\nendstream\nendobj";
    expect(looksLikeBinaryDump(dump)).toBe(true);
    expect(assessExtractedDocumentQuality(dump, "resume").showProfile).toBe(false);
    expect(parseResumeContentString(dump)).toBeNull();
  });

  it("rejects filename-only stubs", () => {
    expect(looksLikeUploadedFilenameStub("[Uploaded file: Senior-Engineer.pdf]")).toBe(true);
    expect(
      assessExtractedDocumentQuality("[Uploaded file: Senior-Engineer.pdf]", "job_description")
        .kind,
    ).toBe("filename_stub");
  });

  it("does not populate a confident resume from an invoice", () => {
    const invoice = "INVOICE #4421\nAmount due: $1200\nBank statement reference 9981\nThank you.";
    expect(assessExtractedDocumentQuality(invoice, "resume").kind).toBe("unrelated");
    expect(parseResumeContentString(invoice)).toBeNull();
  });
});

describe("JD field extraction from PDF body", () => {
  it("reads role, company, and skills from body text not the filename", () => {
    const body = `Job Title: Senior Backend Engineer
Company: Acme Corp
Location: Bengaluru
Required skills: Go, PostgreSQL, Kafka
Responsibilities
Build APIs and data pipelines.`;
    const fields = extractJdFieldsFromText(body);
    expect(fields.role).toMatch(/Senior Backend Engineer/);
    expect(fields.company).toMatch(/Acme/);
    expect(fields.required_skills.join(" ")).toMatch(/Go/);
  });
});

describe("format-aware extractors", () => {
  it("extracts PDF Tj strings without dumping xref binary", () => {
    const pdfBody = [
      "%PDF-1.4",
      "BT (Hello from cover letter body text here.) Tj ET",
      "xref",
      "%%EOF",
    ].join("\n");
    expect(extractPdfTextBasic(new TextEncoder().encode(pdfBody))).toContain(
      "Hello from cover letter",
    );
  });

  it("preserves DOCX paragraph breaks for Skills sections", () => {
    const xml = `<w:p><w:r><w:t>Skills</w:t></w:r></w:p><w:p><w:r><w:t>React</w:t></w:r></w:p><w:p><w:r><w:t>TypeScript</w:t></w:r></w:p>`;
    const text = extractDocxXmlText(xml);
    expect(text).toContain("Skills");
    expect(text).toMatch(/React/);
    expect(text?.split("\n").length).toBeGreaterThan(1);
  });
});
