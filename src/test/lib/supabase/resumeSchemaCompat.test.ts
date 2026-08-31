import { describe, expect, it } from "vitest";
import {
  RESUME_DEDUPE_ORDER_COLUMN,
  isMissingResumeUpdatedAtError,
  omitResumeUpdatedAt,
} from "@/lib/supabase/resumeSchemaCompat";

describe("resume schema compatibility (TC-FB-004 / TC-REG-012 / TC-JRN-002)", () => {
  it("orders duplicate lookups by created_at so unmigrated DBs do not 400", () => {
    expect(RESUME_DEDUPE_ORDER_COLUMN).toBe("created_at");
    expect(RESUME_DEDUPE_ORDER_COLUMN).not.toBe("updated_at");
  });

  it("detects missing resumes.updated_at from PostgREST/Postgres errors", () => {
    expect(
      isMissingResumeUpdatedAtError({ message: "column resumes.updated_at does not exist" }),
    ).toBe(true);
    expect(
      isMissingResumeUpdatedAtError({
        code: "PGRST204",
        message: "Could not find the 'updated_at' column of 'resumes' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingResumeUpdatedAtError({ message: "column resumes.created_at does not exist" })).toBe(
      false,
    );
  });

  it("strips updated_at so insert/update callers never require the column", () => {
    expect(omitResumeUpdatedAt({ name: "CV", updated_at: "2026-08-31T00:00:00Z", user_id: "u1" })).toEqual({
      name: "CV",
      user_id: "u1",
    });
    expect(omitResumeUpdatedAt({ name: "CV", user_id: "u1" })).toEqual({ name: "CV", user_id: "u1" });
  });
});
