import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSchedulerPlaceholderName,
  schedulerCompanyNameSchema,
  schedulerRoleTitleSchema,
  schedulerTimezoneSchema,
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

describe("scheduler timezone schema aliases", () => {
  it("accepts Asia/Calcutta by normalizing to Asia/Kolkata", () => {
    const parsed = schedulerTimezoneSchema.safeParse("Asia/Calcutta");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("Asia/Kolkata");
  });

  it("still rejects unknown IANA zones", () => {
    expect(schedulerTimezoneSchema.safeParse("Not/AZone").success).toBe(false);
  });
});

describe("interview edit time persistence contracts", () => {
  it("fails closed when round update fails (does not navigate after warning)", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/interviews/NewInterview.tsx"),
      "utf8",
    );
    expect(src).not.toContain("Interview updated, but round details failed");
    expect(src).toContain("Could not update interview time:");
    const roundErrIdx = src.indexOf("Could not update interview time:");
    const navigateIdx = src.indexOf("navigate(`/app/interviews/${editId}`)", roundErrIdx);
    // After round error toast, the next navigate for this edit branch must not run
    // without a prior early return — assert return appears between error and navigate.
    const returnIdx = src.indexOf("return;", roundErrIdx);
    expect(returnIdx).toBeGreaterThan(roundErrIdx);
    expect(returnIdx).toBeLessThan(navigateIdx);
  });

  it("updateRound persists timezone via persistableIanaTimezone like addRound", () => {
    const src = fs.readFileSync(
      path.join(root, "src/hooks/useInterviewScheduler.ts"),
      "utf8",
    );
    expect(src).toMatch(/timezoneValue\s*=\s*persistableIanaTimezone\(timezone\.data\)/);
    expect(src).not.toMatch(/timezone\.data === "local" \? null/);
  });

  it("interviewRoundsDB.update verifies a row was updated", () => {
    const src = fs.readFileSync(
      path.join(root, "src/lib/supabase/database.ts"),
      "utf8",
    );
    expect(src).toContain("Interview round update affected no rows.");
    expect(src).toMatch(/\.update\(patch\)[\s\S]{0,200}\.select\("id"\)[\s\S]{0,80}\.maybeSingle\(\)/);
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
