import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  extractAssessmentInventoryDetails,
  messageFromAssessmentStartError,
  userMessageForAssessmentError,
} from "@/lib/assessments/assessmentStart";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("assessment response persistence contracts", () => {
  it("save-test-answer persists via save_owned_test_answer RPC (not direct service upsert)", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/save-test-answer/index.ts"),
      "utf8",
    );
    expect(src).toContain('rpc("save_owned_test_answer"');
    expect(src).toContain("createUserScopedClient");
    expect(src).not.toMatch(/createServiceClient\(\)[\s\S]{0,400}\.from\("test_responses"\)/);
  });

  it("RLS migration allows owner insert/update only on in-progress attempts", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260902210000_assessment_response_write_rls.sql"),
      "utf8",
    );
    expect(sql).toContain("test_responses_own_insert");
    expect(sql).toContain("test_responses_own_update");
    expect(sql).toContain("status = 'IN_PROGRESS'");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("ABANDONED");
    expect(sql.indexOf("INSUFFICIENT_QUESTION_INVENTORY")).toBeLessThan(
      sql.indexOf("INSERT INTO public.mock_tests"),
    );
    expect(sql).toContain("v_available < v_total");
  });

  it("Wave 7 reaffirm migration keeps select+insert+update triad without ALL policy", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260904180000_assessment_response_rls_reaffirm.sql"),
      "utf8",
    );
    expect(sql).toContain("test_responses_own_select");
    expect(sql).toContain("test_responses_own_insert");
    expect(sql).toContain("test_responses_own_update");
    expect(sql).toContain("DROP POLICY IF EXISTS test_responses_all");
    expect(sql).toContain("status = 'IN_PROGRESS'");
  });

  it("assemble-assessment fail-closes PROFILE_CONTEXT_INSUFFICIENT with missingFields", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/assemble-assessment/index.ts"),
      "utf8",
    );
    expect(src).toContain("PROFILE_CONTEXT_INSUFFICIENT");
    expect(src).toContain("missingFields");
    expect(src).toContain("ROLE_NOT_SUPPORTED");
    expect(src).toContain("INSUFFICIENT_QUESTION_INVENTORY");
    expect(src).toContain("available_count");
    expect(src).toContain("requested_count");
  });

  it("maps PROFILE_CONTEXT_INSUFFICIENT with missingFields list", () => {
    expect(
      userMessageForAssessmentError("PROFILE_CONTEXT_INSUFFICIENT", {
        missingFields: ["target_role", "experience_level"],
      }),
    ).toMatch(/Missing: target_role, experience_level/);
  });
});

describe("assessment inventory error UX", () => {
  it("extracts counts from nested and top-level edge payloads", () => {
    expect(
      extractAssessmentInventoryDetails({
        code: "INSUFFICIENT_QUESTION_INVENTORY",
        details: { requested_count: 6, available_count: 2 },
      }),
    ).toEqual({ requested_count: 6, available_count: 2 });

    expect(
      extractAssessmentInventoryDetails({
        requested_count: 10,
        available_count: 2,
      }),
    ).toEqual({ requested_count: 10, available_count: 2 });
  });

  it("maps inventory shortage to an actionable message with counts", () => {
    const err = new ApiClientError({
      message: "short",
      status: 409,
      code: "INSUFFICIENT_QUESTION_INVENTORY",
      details: {
        code: "INSUFFICIENT_QUESTION_INVENTORY",
        details: { requested_count: 6, available_count: 2 },
      },
    });
    const mapped = messageFromAssessmentStartError(err);
    expect(mapped.text).toBe(
      userMessageForAssessmentError("INSUFFICIENT_QUESTION_INVENTORY", {
        requested_count: 6,
        available_count: 2,
      }),
    );
    expect(mapped.retryable).toBe(false);
  });
});
