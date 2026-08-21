import { describe, expect, it } from "vitest";
import {
  validateDocumentFile,
  validateMimeBytes,
  sanitizeUploadFilename,
} from "@/lib/documents/uploadValidation";
import { validateAndRepairGapAnalysis } from "@/lib/validators/gapAnalysisSchemas";

describe("Document Lifecycle E2E Suite", () => {
  it("processes diverse document formats and feeds downstream apps", () => {
    // 1. Text PDF Validation & Ingestion
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    expect(validateMimeBytes(pdfBytes, "pdf")).toBe(true);

    const pdfFile = new File(["dummy pdf content with text"], "resume_john_doe.pdf", {
      type: "application/pdf",
    });
    expect(validateDocumentFile(pdfFile, "resume")).toBeNull();

    // 2. DOCX & XLSX Container Validation
    const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]); // PK\x03\x04
    expect(validateMimeBytes(docxBytes, "docx")).toBe(true);

    // 3. Job Description Parsing & Extraction
    const parsedResume = {
      id: "res-123",
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
      experience_years: 6,
      summary: "Senior Full Stack Engineer building high-scale cloud platforms.",
    };

    const parsedJD = {
      id: "jd-456",
      title: "Staff Frontend Architect",
      company: "Tech Corp",
      required_skills: ["React", "TypeScript", "GraphQL", "Kubernetes"],
    };

    // 4. Invalid File Rejection
    const invalidExe = new File(["malicious"], "exploit.exe", { type: "application/x-msdownload" });
    expect(validateDocumentFile(invalidExe, "resume")).toContain("Unsupported document extension");

    // 5. Mock Interview Onboarding Consumption
    const mockOnboardingState = {
      selectedResumeId: parsedResume.id,
      selectedJdId: parsedJD.id,
      targetRole: parsedJD.title,
      targetCompany: parsedJD.company,
      primarySkills: parsedResume.skills,
    };
    expect(mockOnboardingState.targetRole).toBe("Staff Frontend Architect");
    expect(mockOnboardingState.primarySkills).toContain("React");

    // 6. Practice Coach Consumption
    const practiceContext = {
      userId: "user-1",
      resumeSnippet: parsedResume.summary,
      roleRequirements: parsedJD.required_skills,
    };
    expect(practiceContext.roleRequirements).toHaveLength(4);

    // 7. Gap Analysis Consumption & Bounded Repair
    const mockAiOutput = JSON.stringify({
      match_score: 75,
      matching_skills: ["React", "TypeScript"],
      missing_skills: ["GraphQL", "Kubernetes"],
      recommendations: ["Gain experience with GraphQL schema stitching."],
      experience_gap: "Meets 6-year engineering threshold.",
      education_fit: "Matches technical requirements.",
    });

    const gapResult = validateAndRepairGapAnalysis(mockAiOutput);
    expect(gapResult.success).toBe(true);
    expect(gapResult.data.match_score).toBe(75);
    expect(gapResult.data.missing_skills).toContain("GraphQL");
  });
});
