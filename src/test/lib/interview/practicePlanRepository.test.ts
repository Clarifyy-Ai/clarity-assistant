import { describe, expect, it } from "vitest";
import {
  buildInsertPayload,
  mapRowToItem,
  starBuilderReturnPath,
  type PracticePlanItemRow,
} from "@/lib/interview/practicePlanRepository";
import { buildInterviewPracticePlan } from "@/lib/interview/practicePlan";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import {
  isAiProviderUnavailableError,
  isInsufficientCreditsError,
} from "@/lib/network/aiErrorUx";
import { ApiClientError } from "@/lib/api/apiClient";
import { canUserAReadUserBRow, USER_OWNED_TABLES } from "@/lib/security/rlsTenantIsolation";

describe("practicePlanRepository", () => {
  it("maps DB rows to UI items with UUID ids", () => {
    const row: PracticePlanItemRow = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      plan_id: "ffffffff-1111-4222-8333-444444444444",
      user_id: "99999999-9999-4999-8999-999999999999",
      title: "Rewrite one STAR story",
      activity_type: "star_story",
      competency: "structure",
      reason: "Practice STAR",
      recommended_route: "/app/prep/star-builder",
      completed: false,
      due_offset_days: 2,
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    const item = mapRowToItem(row);
    expect(item.id).toBe(row.id);
    expect(item.activity_type).toBe("star_story");
    expect(item.completed).toBe(false);
  });

  it("builds insert payloads without client slug ids", () => {
    const generated = buildInterviewPracticePlan({
      weakAreas: ["communication"],
      strongAreas: [],
      missingSkills: [],
    });
    const payload = buildInsertPayload("plan-uuid", "user-uuid", generated[0]);
    expect(payload).not.toHaveProperty("id");
    expect(payload.user_id).toBe("user-uuid");
    expect(payload.plan_id).toBe("plan-uuid");
    expect(payload.completed).toBe(false);
    expect(typeof payload.activity_type).toBe("string");
  });

  it("adds returnTo for STAR builder routes", () => {
    expect(starBuilderReturnPath("/app/prep/star-builder")).toContain(
      "returnTo=%2Fapp%2Fplan",
    );
    expect(starBuilderReturnPath("/app/mock")).toBe("/app/mock");
  });
});

describe("STAR rewrite credit and error mapping", () => {
  it("charges star_builder cost for full STAR polish", () => {
    expect(AI_CREDIT_COSTS.star_builder).toBe(10);
    expect(AI_CREDIT_COSTS.polish_star).toBe(2);
  });

  it("treats 502 as provider unavailable, not insufficient credits", () => {
    const err = new ApiClientError({
      message: "AI failed",
      status: 502,
      code: "AI_PROVIDER_UNAVAILABLE",
    });
    expect(isAiProviderUnavailableError(err)).toBe(true);
    expect(isInsufficientCreditsError(err)).toBe(false);
  });

  it("keeps 402 as insufficient credits", () => {
    const err = new ApiClientError({
      message: "Need credits",
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    });
    expect(isInsufficientCreditsError(err)).toBe(true);
    expect(isAiProviderUnavailableError(err)).toBe(false);
  });
});

describe("practice plan RLS contract", () => {
  it("lists practice plan tables as user-owned denied cross-read", () => {
    const table = USER_OWNED_TABLES.find(
      (t) => t.table === "interview_practice_plan_items",
    );
    expect(table).toBeTruthy();
    expect(
      canUserAReadUserBRow({
        table: table!,
        ownerId: "user-a",
        viewerId: "user-b",
      }),
    ).toBe(false);
  });
});
