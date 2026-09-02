import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOV_EXAM_PERSISTENCE_MODES,
  answerSaveBlockReason,
  buildPersistableAnswerRows,
  canPersistExamAnswers,
  isTerminalAnswerSaveRejection,
  resolveGovExamPersistenceMode,
} from "@/lib/gov-exam/attemptAnswerPersistence";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("attempt answer persistence lifecycle", () => {
  const activeAttempt = {
    status: "IN_PROGRESS",
    started_at: "2026-01-01T00:00:00.000Z",
    attempt_phase: "ACTIVE",
  } as const;

  it("allows saves only for in-progress active attempts", () => {
    expect(canPersistExamAnswers(activeAttempt)).toBe(true);
    expect(canPersistExamAnswers({ ...activeAttempt, status: "DRAFT", started_at: null })).toBe(
      false,
    );
    expect(canPersistExamAnswers({ ...activeAttempt, status: "COMPLETED" })).toBe(false);
    expect(canPersistExamAnswers({ ...activeAttempt, status: "ABANDONED" })).toBe(false);
    expect(
      canPersistExamAnswers({ ...activeAttempt, attempt_phase: "SUBMITTED", status: "COMPLETED" }),
    ).toBe(false);
  });

  it("maps block reasons for terminal server rejections", () => {
    expect(answerSaveBlockReason({ status: "COMPLETED", started_at: "x" })).toBe(
      "SUBMISSION_CONFLICT",
    );
    expect(answerSaveBlockReason({ status: "ABANDONED", started_at: "x" })).toBe(
      "ATTEMPT_INVALIDATED",
    );
    expect(answerSaveBlockReason({ status: "DRAFT", started_at: null })).toBe(
      "ATTEMPT_NOT_STARTED",
    );
    expect(isTerminalAnswerSaveRejection("SUBMISSION_CONFLICT")).toBe(true);
    expect(isTerminalAnswerSaveRejection("SAVE_FAILED")).toBe(false);
  });

  it("persists review flags together with selected answers", () => {
    const rows = buildPersistableAnswerRows(
      [{ id: "q1" }, { id: "q2" }],
      {
        q1: { answer: "A", state: "answered-marked" },
        q2: { answer: "", state: "marked" },
      },
      { q1: 12, q2: 4 },
      "2026-01-01T00:01:00.000Z",
    );
    expect(rows[0]).toMatchObject({
      questionId: "q1",
      userAnswer: "A",
      isAttempted: true,
      isMarkedReview: true,
      timeSpentSeconds: 12,
    });
    expect(rows[1]).toMatchObject({
      questionId: "q2",
      userAnswer: null,
      isAttempted: true,
      isMarkedReview: true,
      timeSpentSeconds: 4,
    });
  });

  it.each([
    [{ mode: "custom_mock" }, "custom_mock"],
    [{ mode: "generated_mock" }, "full_mock"],
    [{ basis: "official_previous" }, "official_previous"],
    [{ quick_drill: true }, "quick_drill"],
    [{ source: "exam_template" }, "assessment"],
    [{ source_types: ["OFFICIAL_PYP"] }, "custom_test"],
  ] as const)("resolves %j to %s", (config, expected) => {
    expect(resolveGovExamPersistenceMode(config)).toBe(expected);
    expect(GOV_EXAM_PERSISTENCE_MODES).toContain(
      expected === "custom_test" ? "custom_test" : expected,
    );
  });
});

describe("BUG-023 server persistence contracts", () => {
  it("save_owned_test_answer enforces submission lock and attempt phases", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260902240000_attempt_submission_lifecycle.sql"),
      "utf8",
    );
    expect(sql).toContain("SUBMISSION_CONFLICT");
    expect(sql).toContain("ATTEMPT_INVALIDATED");
    expect(sql).toContain("is_marked_review");
    expect(sql).toContain("client_updated_at");
    expect(sql).toContain("answer_version");
    expect(sql).toContain("p_expected_version");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("QUESTION_NOT_IN_ATTEMPT");
    expect(sql).toContain("CLIENT_CLOCK_INVALID");
  });

  it("TestSession uses shared persistence lifecycle helpers", () => {
    const session = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/TestSession.tsx"),
      "utf8",
    );
    expect(session).toContain("canPersistExamAnswers");
    expect(session).toContain("buildPersistableAnswerRows");
    expect(session).toContain("isTerminalAnswerSaveRejection");
    expect(session).not.toMatch(/from\("test_responses"\)\.upsert/);
  });

  it("save-test-answer maps invalidated attempts to 409", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/save-test-answer/index.ts"),
      "utf8",
    );
    expect(src).toContain("ATTEMPT_INVALIDATED");
    expect(src).toContain("staleQuestionIds");
    expect(src).toContain('rpc("save_owned_test_answer"');
  });

  it("both save handlers use the same owner-scoped RPC", () => {
    for (const handler of ["save-test-answer", "save-attempt-answer"]) {
      const src = fs.readFileSync(
        path.join(root, `supabase/functions/${handler}/index.ts`),
        "utf8",
      );
      expect(src).toContain('rpc("save_owned_test_answer"');
      expect(src).not.toMatch(/\.from\("test_responses"\)[\s\S]{0,300}\.(?:upsert|insert|update)\(/);
    }
  });

  it("submission uses an atomic claim and publishes RESULT_AVAILABLE", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260902240000_attempt_submission_lifecycle.sql"),
      "utf8",
    );
    const submit = fs.readFileSync(
      path.join(root, "supabase/functions/submit-test/index.ts"),
      "utf8",
    );
    expect(sql).toContain("begin_test_submission");
    expect(sql).toContain("attempt_phase = 'SUBMITTING'");
    expect(sql).toContain("attempt_phase = 'RESULT_AVAILABLE'");
    expect(sql).toContain("already_completed");
    expect(submit).toContain('rpc("begin_test_submission"');
    expect(submit).toContain('rpc("release_test_submission"');
  });

  it("client flushes before locking and unlocks only after a failed submit", () => {
    const session = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/TestSession.tsx"),
      "utf8",
    );
    const submitHandler = session.slice(session.indexOf("async function handleSubmit"));
    expect(submitHandler.indexOf("await saveResponses({ throwOnError: true })"))
      .toBeLessThan(submitHandler.indexOf("answersLockedRef.current = true"));
    expect(submitHandler).toContain("answersLockedRef.current = false");
    expect(submitHandler).toContain('removeEventListener("beforeunload"');
  });
});
