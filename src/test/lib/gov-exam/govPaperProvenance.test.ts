import { describe, expect, it } from "vitest";
import {
  resolvePaperAssemblyLabel,
  resolvePaperProviderLabel,
  type GeneratedPaperRow,
} from "@/lib/gov-exam/adminOps";

const baseRow = {
  id: "paper-1",
  exam_id: "exam-1",
  title: "Test paper",
  paper_class: "custom_practice",
  language: "en",
  question_count: 10,
  total_marks: 10,
  duration_minutes: 60,
  blueprint_json: {},
  review_state: "machine_validated" as const,
  quality_score: 0.9,
  mock_test_id: "mock-1",
  job_id: "job-12345678-1234-1234-1234-123456789012",
  paper_source: "approved_bank",
  source_mix: { approved_bank: 10 },
  assembly_source: null,
  provenance_json: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("gov paper provenance admin helpers", () => {
  it("prefers assembly_source column over provenance_json", () => {
    const row: GeneratedPaperRow = {
      ...baseRow,
      assembly_source: "edge_assembler",
      provenance_json: { generator: "python_paper_factory" },
    };
    expect(resolvePaperAssemblyLabel(row)).toBe("edge_assembler");
  });

  it("falls back to provenance_json generator keys", () => {
    const row: GeneratedPaperRow = {
      ...baseRow,
      provenance_json: { generated_by: "python_paper_factory" },
    };
    expect(resolvePaperAssemblyLabel(row)).toBe("python_paper_factory");
  });

  it("shows provider from provenance_json when present", () => {
    const row: GeneratedPaperRow = {
      ...baseRow,
      provenance_json: { provider: "gemini" },
    };
    expect(resolvePaperProviderLabel(row)).toBe("gemini");
  });
});
