import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  mapAvailabilityItem,
  preflightAssessmentTemplates,
} from "@/lib/assessments/assessmentPreflight";
import {
  ASSESSMENT_START_HTTP,
  assessmentStartIdempotencyKey,
  messageFromAssessmentStartError,
  userMessageForAssessmentError,
} from "@/lib/assessments/assessmentStart";
import {
  canUserAReadUserBRow,
  USER_OWNED_TABLES,
} from "@/lib/security/rlsTenantIsolation";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

vi.mock("@/lib/gov-exam/api", () => ({
  checkAssessmentAvailability: vi.fn(),
}));

import { checkAssessmentAvailability } from "@/lib/gov-exam/api";

describe("BUG-14 assessment preflight (fail-closed)", () => {
  beforeEach(() => {
    vi.mocked(checkAssessmentAvailability).mockReset();
  });

  it("maps startable availability as ok", () => {
    const item = mapAvailabilityItem("tpl-1", {
      template_id: "tpl-1",
      startable: true,
      available: 8,
      requested: 6,
    });
    expect(item.status).toBe("ok");
    expect(item.startable).toBe(true);
  });

  it("maps inventory shortage as blocked (409 semantics)", () => {
    const item = mapAvailabilityItem("tpl-1", {
      template_id: "tpl-1",
      startable: false,
      code: "INSUFFICIENT_QUESTION_INVENTORY",
      available: 2,
      requested: 6,
    });
    expect(item.status).toBe("blocked");
    expect(item.startable).toBe(false);
    expect(item.message).toMatch(/needs 6 eligible questions/i);
  });

  it("maps max attempts as blocked (403 semantics)", () => {
    const item = mapAvailabilityItem("tpl-1", {
      template_id: "tpl-1",
      startable: false,
      code: "MAX_ATTEMPTS_REACHED",
      attempts_used: 5,
      max_attempts: 5,
    });
    expect(item.startable).toBe(false);
    expect(item.code).toBe("MAX_ATTEMPTS_REACHED");
    expect(ASSESSMENT_START_HTTP.MAX_ATTEMPTS_REACHED).toBe(403);
    expect(ASSESSMENT_START_HTTP.INSUFFICIENT_QUESTION_INVENTORY).toBe(409);
  });

  it("treats missing availability item as unknown and not startable", () => {
    const item = mapAvailabilityItem("tpl-missing", null, { requestedFallback: 6 });
    expect(item.status).toBe("unknown");
    expect(item.startable).toBe(false);
    expect(item.retryable).toBe(true);
    expect(item.message).toMatch(/verify question inventory/i);
  });

  it("preflightAssessmentTemplates fail-closes when Edge throws", async () => {
    vi.mocked(checkAssessmentAvailability).mockRejectedValue(new Error("network down"));
    const result = await preflightAssessmentTemplates(["a", "b"]);
    expect(result.ok).toBe(false);
    expect(result.byTemplateId.a?.startable).toBe(false);
    expect(result.byTemplateId.b?.status).toBe("unknown");
  });

  it("preflightAssessmentTemplates maps Edge items by template id", async () => {
    vi.mocked(checkAssessmentAvailability).mockResolvedValue([
      {
        template_id: "ok-id",
        startable: true,
        available: 10,
        requested: 6,
      },
      {
        template_id: "short-id",
        startable: false,
        code: "INSUFFICIENT_QUESTION_INVENTORY",
        available: 1,
        requested: 6,
      },
    ]);
    const result = await preflightAssessmentTemplates(["ok-id", "short-id", "missing-id"]);
    expect(result.ok).toBe(true);
    expect(result.byTemplateId["ok-id"]?.startable).toBe(true);
    expect(result.byTemplateId["short-id"]?.startable).toBe(false);
    expect(result.byTemplateId["missing-id"]?.status).toBe("unknown");
  });
});

describe("BUG-14 typed start / save / submit / results contracts", () => {
  it("surfaces 403 and 409 via messageFromAssessmentStartError", () => {
    const unauthorized = messageFromAssessmentStartError(
      new ApiClientError({
        message: "forbidden",
        status: 403,
        code: "ASSESSMENT_NOT_ELIGIBLE",
      }),
    );
    expect(unauthorized.text).toMatch(/not eligible/i);

    const inventory = messageFromAssessmentStartError(
      new ApiClientError({
        message: "conflict",
        status: 409,
        code: "INSUFFICIENT_QUESTION_INVENTORY",
        details: {
          requested_count: 6,
          available_count: 2,
        },
      }),
    );
    expect(inventory.text).toMatch(/needs 6/i);
    expect(inventory.text).toMatch(/only 2/i);
  });

  it("idempotency key is stable for duplicate start", () => {
    const a = assessmentStartIdempotencyKey("user-1", "tpl-1");
    const b = assessmentStartIdempotencyKey("user-1", "tpl-1");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });

  it("catalog UI uses fail-closed preflight (never default startable true)", () => {
    const ui = fs.readFileSync(
      path.join(root, "src/pages/app/assessments/AssessmentTemplates.tsx"),
      "utf8",
    );
    expect(ui).toContain("preflightAssessmentTemplates");
    expect(ui).toContain("pref?.startable === true");
    expect(ui).not.toMatch(/avail \? avail\.startable !== false : true/);
  });

  it("review resolves template by slug only and prefights before assemble", () => {
    const ui = fs.readFileSync(
      path.join(root, "src/pages/app/assessments/AssessmentReview.tsx"),
      "utf8",
    );
    expect(ui).toContain("preflightSingleAssessmentTemplate");
    expect(ui).toContain("ROLE_NOT_SUPPORTED");
    expect(ui).not.toContain(".limit(1)");
    expect(ui).not.toMatch(/anyTpl|any published/);
  });

  it("session and results route assessment users back to assessments catalog", () => {
    const session = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/TestSession.tsx"),
      "utf8",
    );
    const results = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/TestResults.tsx"),
      "utf8",
    );
    expect(session).toContain("catalogPathForTest");
    expect(session).toContain("/app/assessments");
    expect(session).toContain("started_at");
    expect(session).not.toMatch(/\bstartTime\b/);
    expect(results).toContain("Back to assessments");
    expect(results).toContain("Score analysis is missing");
    expect(results).toContain("Scores are never invented");
  });

  it("assessment timer helpers use started_at only (no startTime field)", () => {
    const timer = fs.readFileSync(
      path.join(root, "src/lib/gov-exam/examTimer.ts"),
      "utf8",
    );
    expect(timer).toContain("started_at");
    expect(timer).not.toMatch(/\bstartTime\b/);
  });

  it("inventory alignment migration seeds ready questions", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260904200000_assessment_inventory_alignment.sql"),
      "utf8",
    );
    expect(sql).toContain("clarify_original_seed_v4_inventory");
    expect(sql).toContain("data-analyst");
    expect(sql).toContain("validation_status");
    expect(sql).toContain("review_status");
  });

  it("submit-test writes test_analyses after claim", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/submit-test/index.ts"),
      "utf8",
    );
    expect(src).toContain("claim_and_complete_test");
    expect(src).toContain("test_analyses");
  });

  it("save-test-answer uses owned RPC", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/save-test-answer/index.ts"),
      "utf8",
    );
    expect(src).toContain("save_owned_test_answer");
  });

  it("cross-user RLS contract denies User A reading User B rows", () => {
    const mockTests = USER_OWNED_TABLES.find((t) => t.table === "mock_tests");
    const analyses = USER_OWNED_TABLES.find((t) => t.table === "test_analyses");
    const responses = USER_OWNED_TABLES.find((t) => t.table === "test_responses");
    expect(mockTests).toBeTruthy();
    expect(analyses).toBeTruthy();
    expect(responses).toBeTruthy();
    expect(
      canUserAReadUserBRow({
        table: mockTests!,
        viewerId: "user-a",
        ownerId: "user-b",
      }),
    ).toBe(false);
    expect(
      canUserAReadUserBRow({
        table: analyses!,
        viewerId: "user-a",
        ownerId: "user-a",
      }),
    ).toBe(true);
  });

  it("CONTENT_INSUFFICIENT user copy stays honest", () => {
    expect(userMessageForAssessmentError("CONTENT_INSUFFICIENT")).toMatch(
      /not enough approved question-bank content/i,
    );
  });
});
