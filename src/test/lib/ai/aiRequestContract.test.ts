import { describe, expect, it } from "vitest";
import {
  normalizeCoachPayload,
  assertClientContextForOperation,
  ContextValidationError,
} from "@/lib/ai/aiRequestContract";
import {
  scoreAnswerBankRelevance,
  selectRelevantAnswerBankEntries,
} from "@/lib/ai/answerBankRelevance";

describe("aiRequestContract", () => {
  it("requires question for generate_hint", () => {
    expect(() =>
      assertClientContextForOperation("generate_hint", { resume_context: "x" }),
    ).toThrow(ContextValidationError);
  });

  it("normalizes coach payload with question_class and style", () => {
    const payload = normalizeCoachPayload("generate_hint", {
      question: "Tell me about a time you handled conflict",
      interview_type: "behavioral",
      hint_style: "detailed",
      coach_tone: "direct",
      role: "QA Engineer",
      experience_level: "mid",
    });
    expect(payload.question_class).toBe("behavioural");
    expect(payload.hint_style).toBe("full_answer");
    expect(payload.coach_tone).toBe("direct");
    expect(payload.role).toBe("QA Engineer");
  });

  it("classifies coding questions separately from session type", () => {
    const payload = normalizeCoachPayload("generate_hint", {
      question: "Write a function to reverse a linked list and analyze time complexity",
      interview_type: "behavioral",
    });
    expect(payload.question_class).toBe("coding");
  });
});

describe("answerBankRelevance", () => {
  const qaEntry = {
    id: "a1",
    question_text: "Tell me about API test automation with Selenium",
    star_situation: "Built Selenium framework for REST APIs",
    star_task: "Improve regression coverage",
    star_action: "Implemented Page Object Model",
    star_result: "Reduced manual testing by 40%",
  };

  const backendEntry = {
    id: "b1",
    question_text: "Describe a FastAPI microservice you built",
    star_situation: "Designed Python FastAPI service",
    star_task: "Handle 10k RPS",
    star_action: "Used PostgreSQL and Redis",
    star_result: "Achieved 99.9% uptime",
  };

  it("ranks QA story higher for QA-related question", () => {
    const question = "Tell me about your experience with API testing and Selenium";
    const qaScore = scoreAnswerBankRelevance(qaEntry, question);
    const backendScore = scoreAnswerBankRelevance(backendEntry, question);
    expect(qaScore).toBeGreaterThan(backendScore);
  });

  it("selectRelevantAnswerBankEntries prefers matching profile stories", () => {
    const selected = selectRelevantAnswerBankEntries(
      [backendEntry, qaEntry],
      "Describe your Selenium and API testing experience",
      { max: 1 },
    );
    expect(selected[0]?.id).toBe("a1");
  });

  it("boosts preferIds when scores are tied", () => {
    const selected = selectRelevantAnswerBankEntries(
      [backendEntry, qaEntry],
      "general leadership example",
      { max: 1, preferIds: ["b1"] },
    );
    expect(selected[0]?.id).toBe("b1");
  });
});

describe("personalization golden fixtures", () => {
  const USER_A = { role: "QA Engineer", skills: ["Selenium", "API Testing", "SQL"] };
  const USER_B = { role: "Backend Engineer", skills: ["Python", "FastAPI", "PostgreSQL"] };

  it("builds different normalized payloads for different users", () => {
    const payloadA = normalizeCoachPayload("generate_hint", {
      question: "Tell me about yourself",
      role: USER_A.role,
      experience_level: "mid",
      resume_context: USER_A.skills.join(", "),
    });
    const payloadB = normalizeCoachPayload("generate_hint", {
      question: "Tell me about yourself",
      role: USER_B.role,
      experience_level: "mid",
      resume_context: USER_B.skills.join(", "),
    });
    expect(payloadA.role).not.toBe(payloadB.role);
    expect(payloadA.resume_context).not.toBe(payloadB.resume_context);
  });
});
