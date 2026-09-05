import { describe, it, expect } from "vitest";
import {
  buildResumePreviewSections,
  buildCoverLetterPreviewSections,
  buildPortfolioPreviewSections,
  splitDocumentTextIntoSections,
} from "@/lib/documents/documentPreviewFormat";

describe("documentPreviewFormat", () => {
  it("splits flattened resume text into labeled sections", () => {
    const text =
      "MONALI BARAI Computer Science Student PROFILE SUMMARY Strong interest in programming SKILLS Java Python EXPERIENCE Intern at Acme";
    const sections = splitDocumentTextIntoSections(text);
    expect(sections.map((section) => section.heading)).toEqual([
      "Header",
      "Profile Summary",
      "Skills",
      "Experience",
    ]);
  });

  it("uses section parsing for text-fallback resumes", () => {
    const sections = buildResumePreviewSections({
      full_name: null,
      email: null,
      phone: null,
      location: null,
      summary: "JANE DOE PROFILE SUMMARY Software engineer with 5 years SKILLS React Node",
      skills: [],
      tech_stack: [],
      experience: [],
      projects: [],
      education: [],
      total_years_experience: null,
      seniority_signal: null,
    });
    expect(sections.some((section) => section.heading === "Profile Summary")).toBe(true);
  });

  it("formats cover letters as opening/body/closing instead of resume headers", () => {
    const sections = buildCoverLetterPreviewSections(
      "Dear Hiring Manager,\n\nI am excited to apply for the role.\n\nSincerely,\nJane",
    );
    expect(sections.map((s) => s.heading)).toContain("Opening");
    expect(sections.map((s) => s.heading)).toContain("Closing");
    expect(sections.some((s) => s.heading === "Profile Summary")).toBe(false);
  });

  it("formats portfolio text with project-oriented headings", () => {
    const sections = buildPortfolioPreviewSections(
      "Overview of my work. PROJECTS Built a dashboard for analytics.",
    );
    expect(sections.some((s) => s.heading === "Overview" || s.heading === "Projects")).toBe(true);
  });
});
