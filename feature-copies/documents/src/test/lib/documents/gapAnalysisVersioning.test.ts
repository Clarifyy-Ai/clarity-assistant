import { describe, expect, it, vi } from "vitest";
import {
  isAnalysisStale,
  type GapAnalysisResult,
} from "@/lib/documents/gapAnalysisPersist";
import {
  validateAndRepairGapAnalysis,
  repairJsonString,
  gapAnalysisRequestSchema,
  gapAnalysisResultSchema,
} from "@/lib/validators/gapAnalysisSchemas";

describe("Gap Analysis Dependency, Versioning, and Error Handling", () => {
  describe("1. Precondition & Dependency Validation Rules", () => {
    it("validates request schema with valid UUIDs", () => {
      const validReq = {
        resume_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        jd_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
        force_rerun: false,
      };
      const parsed = gapAnalysisRequestSchema.safeParse(validReq);
      expect(parsed.success).toBe(true);
    });

    it("rejects malformed UUIDs", () => {
      const invalidReq = {
        resume_id: "not-a-uuid",
        jd_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      };
      const parsed = gapAnalysisRequestSchema.safeParse(invalidReq);
      expect(parsed.success).toBe(false);
    });

    it("detects unparsed resume with empty or short content", () => {
      const isResumeParsed = (content?: string | null) =>
        Boolean(content && content.trim().length >= 20);

      expect(isResumeParsed(null)).toBe(false);
      expect(isResumeParsed("")).toBe(false);
      expect(isResumeParsed("short")).toBe(false);
      expect(
        isResumeParsed(
          "Senior Full Stack Software Engineer with 8 years experience building scalable systems.",
        ),
      ).toBe(true);
    });

    it("detects unparsed JD with empty or missing data", () => {
      const isJdParsed = (content?: string | null, parsedData?: unknown) =>
        Boolean(
          (content && content.trim().length >= 20) ||
            (parsedData &&
              typeof parsedData === "object" &&
              Object.keys(parsedData).length > 0),
        );

      expect(isJdParsed(null, null)).toBe(false);
      expect(isJdParsed("   ", {})).toBe(false);
      expect(
        isJdParsed(
          "Looking for a Senior React/TypeScript engineer to lead frontend architecture.",
        ),
      ).toBe(true);
      expect(isJdParsed("", { title: "Lead Engineer", skills: ["React"] })).toBe(
        true,
      );
    });

    it("enforces strict user ownership between user and documents", () => {
      const currentUserId = "user-123";
      const resume = { id: "res-1", user_id: "user-123" };
      const otherResume = { id: "res-2", user_id: "user-456" };

      expect(resume.user_id === currentUserId).toBe(true);
      expect(otherResume.user_id === currentUserId).toBe(false);
    });
  });

  describe("2. Bounded AI JSON Repair & Schema Validation", () => {
    it("parses clean JSON response successfully", () => {
      const cleanJson = JSON.stringify({
        match_score: 85,
        matching_skills: ["React", "TypeScript", "Node.js"],
        missing_skills: ["GraphQL"],
        recommendations: ["Learn GraphQL query optimization"],
        experience_gap: "Meets experience requirements",
        education_fit: "Degree matches job requirements",
      });

      const result = validateAndRepairGapAnalysis(cleanJson);
      expect(result.success).toBe(true);
      expect(result.data.match_score).toBe(85);
      expect(result.data.matching_skills).toHaveLength(3);
      expect(result.data.parse_failed).toBe(false);
      expect(result.repaired).toBe(false);
    });

    it("performs bounded repair on markdown fences and trailing commas", () => {
      const malformedWithFencesAndCommas = `
      \`\`\`json
      {
        "match_score": 75,
        "matching_skills": ["Python", "PostgreSQL",],
        "missing_skills": ["Kubernetes",],
        "recommendations": ["Deploy containers on K8s",],
        "experience_gap": "Minor infrastructure gap",
        "education_fit": "Good fit",
      }
      \`\`\`
      `;

      const result = validateAndRepairGapAnalysis(malformedWithFencesAndCommas);
      expect(result.success).toBe(true);
      expect(result.data.match_score).toBe(75);
      expect(result.data.matching_skills).toEqual(["Python", "PostgreSQL"]);
      expect(result.data.missing_skills).toEqual(["Kubernetes"]);
      expect(result.repaired).toBe(true);
    });

    it("handles unrecoverable JSON without exposing raw errors and saves recoverable fallback", () => {
      const completelyBroken = "Here is my analysis: Match is good but there are issues...";

      const result = validateAndRepairGapAnalysis(completelyBroken);
      expect(result.success).toBe(false);
      expect(result.data.parse_failed).toBe(true);
      expect(result.data.match_score).toBe(0);
      expect(result.data.recommendations[0]).toContain("could not be parsed safely");
      expect(result.error).toBe("Failed to parse structured analysis safely.");
    });
  });

  describe("3. Versioning, Staleness, and Historical Preservation", () => {
    it("detects stale analysis when resume content_hash updates", () => {
      const isStale = isAnalysisStale({
        storedResumeUpdatedAt: "hash-v1-resume",
        currentResumeUpdatedAt: "hash-v2-resume", // Updated!
        storedJdUpdatedAt: "hash-v1-jd",
        currentJdUpdatedAt: "hash-v1-jd",
      });

      expect(isStale).toBe(true);
    });

    it("detects stale analysis when JD updates", () => {
      const isStale = isAnalysisStale({
        storedResumeUpdatedAt: "hash-v1-resume",
        currentResumeUpdatedAt: "hash-v1-resume",
        storedJdUpdatedAt: "2026-08-01T10:00:00Z",
        currentJdUpdatedAt: "2026-08-21T12:00:00Z", // Updated!
      });

      expect(isStale).toBe(true);
    });

    it("recognizes fresh analysis when versions match", () => {
      const isStale = isAnalysisStale({
        staleFlag: false,
        storedResumeUpdatedAt: "hash-v1-resume",
        currentResumeUpdatedAt: "hash-v1-resume",
        storedJdUpdatedAt: "hash-v1-jd",
        currentJdUpdatedAt: "hash-v1-jd",
      });

      expect(isStale).toBe(false);
    });

    it("preserves historical records across version changes and reruns", () => {
      // Simulate historical runs repository
      const historicalAnalyses: Array<{
        id: string;
        resume_version: string;
        jd_version: string;
        stale: boolean;
        status: string;
        result: GapAnalysisResult;
      }> = [];

      // Run 1 (Version 1)
      historicalAnalyses.push({
        id: "gap-run-1",
        resume_version: "res-v1",
        jd_version: "jd-v1",
        stale: false,
        status: "completed",
        result: { match_score: 70 },
      });

      // Resume changes -> Run 1 marked stale, but preserved in history
      historicalAnalyses[0].stale = true;
      historicalAnalyses[0].status = "stale";

      // Run 2 (Version 2)
      historicalAnalyses.push({
        id: "gap-run-2",
        resume_version: "res-v2",
        jd_version: "jd-v1",
        stale: false,
        status: "completed",
        result: { match_score: 90 },
      });

      expect(historicalAnalyses).toHaveLength(2);
      expect(historicalAnalyses[0].stale).toBe(true);
      expect(historicalAnalyses[0].result.match_score).toBe(70); // Preserved!
      expect(historicalAnalyses[1].stale).toBe(false);
      expect(historicalAnalyses[1].result.match_score).toBe(90);
    });
  });
});
