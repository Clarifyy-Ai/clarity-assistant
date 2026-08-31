import { describe, expect, it } from "vitest";
import {
  isSchedulerPlaceholderName,
  schedulerCompanyNameSchema,
  schedulerRoleTitleSchema,
} from "@/lib/validators/interviewSchemas";
import { questionMissingSource } from "@/lib/gov-exam/adminOps";

describe("scheduler placeholder rejection", () => {
  it("rejects placeholder company and role", () => {
    expect(isSchedulerPlaceholderName("company")).toBe(true);
    expect(schedulerCompanyNameSchema.safeParse("test").success).toBe(false);
    expect(schedulerRoleTitleSchema.safeParse("role").success).toBe(false);
    expect(schedulerCompanyNameSchema.safeParse("Acme Labs").success).toBe(true);
  });
});

describe("questionMissingSource", () => {
  it("flags rows with no source provenance", () => {
    expect(questionMissingSource({ source: null, source_type: null, metadata: {} })).toBe(true);
    expect(
      questionMissingSource({ source: "UPSC 2024", source_type: "official", metadata: {} }),
    ).toBe(false);
  });
});
