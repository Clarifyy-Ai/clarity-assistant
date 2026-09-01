import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSchedulerPlaceholderName,
  schedulerCompanyNameSchema,
  schedulerRoleTitleSchema,
} from "@/lib/validators/interviewSchemas";
import { questionMissingSource } from "@/lib/gov-exam/adminOps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

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

describe("schedule-interview cancel", () => {
  it("persists cancelled status and does not require company on cancel", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/schedule-interview/index.ts"),
      "utf8",
    );
    expect(src).toContain('status: "cancelled"');
    expect(src.indexOf('action === "cancel"')).toBeLessThan(src.indexOf("placeholderValues"));
  });
});
