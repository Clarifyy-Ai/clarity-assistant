import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessExtractedDocumentQuality,
  buildHealedJdParsedData,
  extractJdFieldsFromText,
  extractSkillsFromResumeText,
  getJdDetailParseUi,
  isJdContentReadyForDisplay,
  looksLikeBinaryDump,
  looksLikeUploadedFilenameStub,
  normalizeSkillList,
  shouldKeepJdParseSuccess,
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

  it("splits comma-separated skill strings", () => {
    expect(normalizeSkillList("Selenium, Java, API Testing")).toEqual([
      "Selenium",
      "Java",
      "API Testing",
    ]);
  });

  it("extracts skills from section and inline resume prose", () => {
    const prose = `SHABEENA SULTANA SHAIK
Software Testing (SDET) Trainee

Technical Skills: Selenium, Java, API Testing, Postman
Experience
QA Intern at QSpiders`;
    const skills = extractSkillsFromResumeText(prose);
    expect(skills).toEqual(expect.arrayContaining(["Selenium", "Java", "API Testing", "Postman"]));
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
    expect(fields.location).toMatch(/Bengaluru/);
    expect(fields.required_skills.join(" ")).toMatch(/Go/);
  });

  it("maps Meta-style Location line to the Location KPI string", () => {
    const body = `Job Title: AI Engineer
Company: Meta
Location: Hyderabad / Bangalore / Remote
Required skills: Python, PyTorch
Responsibilities
Ship models.`;
    const fields = extractJdFieldsFromText(body);
    expect(fields.location).toBe("Hyderabad / Bangalore / Remote");
  });

  it("reads Locations and Work Location variants", () => {
    expect(
      extractJdFieldsFromText("Locations: Remote — India\nCompany: Acme").location,
    ).toMatch(/Remote/);
    expect(
      extractJdFieldsFromText("Work Location: Pune\nCompany: Acme").location,
    ).toBe("Pune");
  });

  it("reads salary_range from compensation lines", () => {
    const fields = extractJdFieldsFromText(
      "Role: Engineer\nCompany: Acme\nSalary: ₹25–40 LPA\nRequired skills: Go",
    );
    expect(fields.salary_range).toMatch(/25/);
  });

  it("extracts location and salary from single-line PDF-style text", () => {
    const flat =
      "Job Title AI engineer Company microsoft Location Hyderabad / Bangalore / Remote Salary $150,000 - $200,000 Required skills Python";
    const fields = extractJdFieldsFromText(flat);
    expect(fields.location).toMatch(/Hyderabad/);
    expect(fields.salary_range).toMatch(/150/);
  });

  it("heals missing location into parsed_data without wiping existing skills", () => {
    const content = `Job Title: AI Engineer
Company: Meta
Location: Hyderabad / Bangalore / Remote
Required skills: Python, LLM`;
    const { parsed_data, shouldWrite } = buildHealedJdParsedData(content, {
      required_skills: ["Python"],
      location: null,
    });
    expect(shouldWrite).toBe(true);
    expect(parsed_data.location).toBe("Hyderabad / Bangalore / Remote");
    expect(parsed_data.required_skills).toEqual(["Python"]);
  });
});

describe("JD parse timeout reconcile and detail UI", () => {
  it("keeps a ready non-stub row after client timeout", () => {
    expect(
      shouldKeepJdParseSuccess({
        parse_status: "ready",
        content: "Job Title: Engineer\nLocation: Remote",
      }),
    ).toBe(true);
    expect(
      shouldKeepJdParseSuccess({
        parse_status: "ready",
        content: "[Uploaded file: jd.pdf]",
      }),
    ).toBe(false);
    expect(
      shouldKeepJdParseSuccess({
        parse_status: "parsing",
        content: "Job Title: Engineer",
      }),
    ).toBe(false);
  });

  it("shows non-stub content even when parse_status is error and surfaces Re-parse", () => {
    const readyError = getJdDetailParseUi({
      content: "Location: Hyderabad / Bangalore / Remote\nCompany: Meta",
      parse_status: "error",
    });
    expect(readyError.contentReady).toBe(true);
    expect(readyError.showParseRecovery).toBe(true);

    const stub = getJdDetailParseUi({
      content: "[Uploaded file: Google-JD.pdf]",
      parse_status: "parsing",
    });
    expect(stub.contentReady).toBe(false);
    expect(stub.showParseRecovery).toBe(true);
    expect(isJdContentReadyForDisplay(stub.content as string)).toBe(false);
  });

  it("never treats raw PDF binary as ready JD body text", () => {
    const dump = "%PDF-1.4\n1 0 obj\n<< /Length 4 >>\nstream\n\u0000\u0001\u0002\nendstream\nendobj\nxref";
    expect(isJdContentReadyForDisplay(dump)).toBe(false);
    expect(getJdDetailParseUi({ content: dump, parse_status: "ready" }).contentReady).toBe(false);
    expect(extractJdFieldsFromText(dump).summary).toBe("");
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

describe("gap-analysis write path", () => {
  it("does not coerce skills with String() which yields [object Object]", () => {
    const source = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../supabase/functions/gap-analysis/index.ts",
      ),
      "utf8",
    );
    expect(source).toContain("skillFromUnknown");
    expect(source).not.toMatch(/matching_skills\.map\(String\)/);
  });
});
