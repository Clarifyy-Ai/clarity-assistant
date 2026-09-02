import { describe, expect, it } from "vitest";
import {
  COMMUNITY_REPORT_ALREADY_EXISTS_CODE,
  isDuplicateCommunityReportError,
} from "@/lib/community/reportContent";
import { COMMUNITY_MODULE_LABEL } from "@/lib/community/moderation";

describe("isDuplicateCommunityReportError", () => {
  it("detects Postgres unique violation code", () => {
    expect(isDuplicateCommunityReportError({ code: "23505", message: "duplicate" })).toBe(true);
  });

  it("detects HTTP 409 from PostgREST", () => {
    expect(isDuplicateCommunityReportError({ status: 409, message: "Conflict" })).toBe(true);
  });

  it("detects duplicate wording in message", () => {
    expect(
      isDuplicateCommunityReportError({
        message: 'duplicate key value violates unique constraint "community_reports_one_per_reporter_target"',
      }),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isDuplicateCommunityReportError({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
  });
});

describe("community report contracts", () => {
  it("exposes a stable already-reported code for UI handling", () => {
    expect(COMMUNITY_REPORT_ALREADY_EXISTS_CODE).toBe("COMMUNITY_REPORT_ALREADY_EXISTS");
  });

  it("marks reported posts via moderate-content after insert", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const source = readFileSync(resolve(root, "src/lib/community/reportContent.ts"), "utf8");
    expect(source).toContain("mark_post_reported");
    const edge = readFileSync(
      resolve(root, "supabase/functions/moderate-content/index.ts"),
      "utf8",
    );
    expect(edge).toContain("resolve_post");
    expect(edge).toContain("mark_post_reported");
  });
});

describe("community module naming", () => {
  it("uses Community as the canonical nav label", () => {
    expect(COMMUNITY_MODULE_LABEL).toBe("Community");
  });
});

describe("PostDetail report integration", () => {
  it("uses idempotent submitCommunityReport instead of direct insert", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const source = readFileSync(
      resolve(root, "src/pages/app/community/PostDetail.tsx"),
      "utf8",
    );
    expect(source).toContain("submitCommunityReport");
    expect(source).not.toMatch(/from\("community_reports"\)\s*\n\s*\.insert/);
    expect(source).toContain("reportInFlightRef");
  });
});
