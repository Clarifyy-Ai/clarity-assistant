import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("TC-MOD-018 assessment lifecycle contracts", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260903180000_assessment_lifecycle_hardening.sql"),
    "utf8",
  );
  const saveEdge = fs.readFileSync(
    path.join(root, "supabase/functions/save-test-answer/index.ts"),
    "utf8",
  );
  const templatesUi = fs.readFileSync(
    path.join(root, "src/pages/app/assessments/AssessmentTemplates.tsx"),
    "utf8",
  );
  const sessionUi = fs.readFileSync(
    path.join(root, "src/pages/app/mock-test/TestSession.tsx"),
    "utf8",
  );

  it("seeds additional HR questions without lowering question_count", () => {
    expect(migration).toContain("clarify_original_seed_v3_hr");
    expect(migration).toContain("ARRAY['hr-interview']");
    expect(migration).toContain("question_count = 5");
    expect(migration).toContain("WHERE slug = 'hr-interview'");
  });

  it("shares inventory helper between availability and assemble", () => {
    expect(migration).toContain("count_eligible_assessment_questions");
    expect(migration).toContain("assessment_template_availability");
    expect(migration).toContain("v_available := public.count_eligible_assessment_questions");
  });

  it("counts only COMPLETED attempts toward max_attempts", () => {
    expect(migration).toContain("AND status = 'COMPLETED'");
    expect(migration).not.toMatch(
      /SELECT count\(\*\) INTO v_attempts[\s\S]*status IN \('COMPLETED', 'IN_PROGRESS'\)/,
    );
  });

  it("fixes save_owned_test_answer uuid membership check", () => {
    expect(migration).toContain(
      "p_question_id = ANY (COALESCE(v_test.question_ids, ARRAY[]::uuid[]))",
    );
    expect(migration).not.toContain("p_question_id::text = ANY");
  });

  it("persists pause/resume with expires_at accrual", () => {
    expect(migration).toContain("pause_owned_mock_test");
    expect(migration).toContain("resume_owned_mock_test");
    expect(migration).toContain("total_paused_ms");
    expect(migration).toContain("paused_at");
  });

  it("wires availability preflight into assessments UI", () => {
    expect(templatesUi).toContain("preflightAssessmentTemplates");
    expect(templatesUi).toContain("startable");
    expect(templatesUi).toContain("Continue assessment");
    expect(templatesUi).toContain("pref?.startable === true");
  });

  it("wires server pause into TestSession and shows save status", () => {
    expect(sessionUi).toContain("pauseTest");
    expect(sessionUi).toContain("resumeTest");
    expect(sessionUi).toContain("answer-save-status");
    expect(sessionUi).toContain("Remaining time is frozen");
    expect(saveEdge).toContain("save_owned_test_answer");
  });
});
