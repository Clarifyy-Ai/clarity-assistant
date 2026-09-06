import { freezeResumeTextForInterview } from "@/lib/mock/interviewContext";
import { getLocalMockQuestions } from "@/lib/mock/localQuestionBank";
import { selectFallbackQuestions } from "@/lib/mock/selectFallbackQuestion";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readEdge(name: string): string {
  return fs.readFileSync(
    path.join(root, "supabase/functions", name, "index.ts"),
    "utf8",
  );
}

function readShared(name: string): string {
  return fs.readFileSync(
    path.join(root, "supabase/functions/_shared", name),
    "utf8",
  );
}

describe("BUG 10 — mock questions use resume/domain context", () => {
  it("MATRIX mock_question_generation prefers AI over database bank", () => {
    const router = readShared("operationRouter.ts");
    expect(router).toMatch(
      /mock_question_generation:[\s\S]*?canCompleteWithDatabase:\s*false[\s\S]*?preferredOrder:\s*\["ai",\s*"python"\]/,
    );
  });

  it("generate-questions does not treat count=1 as a bank hit", () => {
    const source = readEdge("generate-questions");
    expect(source).toContain("isAiForceUnavailable()");
    expect(source).not.toMatch(
      /if\s*\(\s*body\.questionCount\s*===\s*1/,
    );
    expect(source).toContain("resume_digest");
    expect(source).toContain("phase:");
    expect(source).toContain("competency:");
    expect(source).toContain("MOST RECENT ANSWER");
    expect(source).toContain("previous_answers_digest");
  });

  it("requestHash includes distinct digests for different resumes", () => {
    const source = readEdge("generate-questions");
    expect(source).toContain('resume_digest: await sha256Hex((body.resume_context');
    expect(source).toContain('jd_digest: await sha256Hex((body.job_description');
    expect(source).toContain("skills: body.skills_to_emphasize");
  });

  it("QA vs backend vs data vs frontend roles yield different ranked bank stems", () => {
    const roles = [
      { role: "QA Engineer", skills: ["selenium", "testing"] },
      { role: "Backend Engineer", skills: ["api", "python", "sql"] },
      { role: "Data Analyst", skills: ["sql", "analytics", "data"] },
      { role: "Frontend Engineer", skills: ["react", "javascript"] },
    ];

    const firsts = roles.map((r) =>
      getLocalMockQuestions({
        type: "mixed",
        count: 3,
        role: r.role,
        skills: r.skills,
        company: "Acme",
        rotateSeed: 0,
      }).map((q) => q.question_text),
    );

    // At least two role setups must diverge in their top stems.
    const unique = new Set(firsts.map((list) => list.join("|")));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("company context personalizes HR motivation stem when bank falls back", () => {
    const selected = selectFallbackQuestions({
      type: "hr",
      count: 1,
      company: "Stripe",
      role: "Product Manager",
      excludeTexts: [],
    });
    expect(selected.length).toBe(1);
    expect(selected[0].question_text.toLowerCase()).toMatch(/stripe/);
  });

  it("freezeResumeTextForInterview prefers parsed structure over raw blob", () => {
    const raw = `
Jane Doe
Summary: Backend engineer specializing in APIs and Postgres.
Skills: Python, PostgreSQL, Redis, Docker
Experience:
Senior Backend Engineer @ Acme — Built payment APIs
`;
    const frozen = freezeResumeTextForInterview(raw, {
      role: "Backend Engineer",
      company: "Acme",
    });
    expect(frozen).toContain("Target role");
    expect(frozen).toMatch(/Backend|Python|Skills/i);
    expect(frozen).not.toBe(raw.trim());
  });
});
