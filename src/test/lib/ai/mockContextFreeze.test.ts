import { describe, expect, it } from "vitest";
import {
  setMockInterviewContext,
  getMockInterviewContext,
  clearMockInterviewContext,
} from "@/lib/mock/mockContextBridge";
import type { InterviewContextSnapshot } from "@/lib/mock/interviewContext";

const SNAPSHOT: InterviewContextSnapshot = {
  version: "interview_context_v1",
  created_at: "2026-01-01T00:00:00.000Z",
  role: "Backend Engineer",
  company: "Acme",
  interview_type: "technical",
  experience_level: "senior",
  seniority: "senior",
  industry: "tech",
  difficulty: "medium",
  planned_question_count: 5,
  duration_minutes: 30,
  language: "en",
  voice_id: null,
  input_mode: "voice",
  follow_up_depth: "light",
  resume_id: "r1",
  jd_id: "j1",
  resume_text: "Python FastAPI PostgreSQL",
  jd_text: "Backend role requiring Python",
  resume_hash: "abc",
  jd_hash: "def",
  focus_competencies: [],
  skills_to_emphasize: ["Python"],
  skills_not_to_claim: [],
  topics_to_avoid: [],
  answer_bank_context_ids: [],
  answer_bank_snippets: [],
  rubric_version: "mock_rubric_v1",
  question_policy_version: "mock_question_policy_v1",
};

describe("mockContextBridge", () => {
  it("stores and retrieves frozen interview snapshot", () => {
    setMockInterviewContext(SNAPSHOT);
    expect(getMockInterviewContext()?.role).toBe("Backend Engineer");
    expect(getMockInterviewContext()?.resume_text).toContain("Python");
    clearMockInterviewContext();
    expect(getMockInterviewContext()).toBeNull();
  });
});
