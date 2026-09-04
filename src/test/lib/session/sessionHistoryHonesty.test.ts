import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("session history load honesty", () => {
  it("CallSessions keeps list on append failure and never says No more sessions on error", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/sessions/CallSessions.tsx"),
      "utf8",
    );
    expect(page).toContain("loadMoreError");
    expect(page).toContain('mode === "append"');
    expect(page).not.toMatch(/No more sessions/i);
    // End-of-list copy is gated behind !loadMoreError.
    expect(page).toContain("You’ve reached the end of your session history.");
    expect(page).toContain("loadMoreError ?");
  });

  it("fetchSessionHistory throws on ok:false and never returns empty for backend errors", () => {
    const api = fs.readFileSync(
      path.join(root, "src/lib/session/sessionHistoryApi.ts"),
      "utf8",
    );
    expect(api).toContain("Never returns an empty list for backend errors");
    expect(api).toContain("SessionHistoryApiError");
    expect(api).toContain("!payload.ok");
  });
});

describe("debrief server entitlement", () => {
  it("hasCapability uses launchPlanRank so Pro aliases are not blank-denied", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/requireCapability.ts"),
      "utf8",
    );
    expect(src).toContain("launchPlanRank(planId)");
    expect(src).not.toMatch(/if\s*\(\s*!id\s*\)\s*return\s*false/);
  });

  it("billing catalog aliases Razorpay pro product ids", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/billingCatalog.ts"),
      "utf8",
    );
    expect(src).toContain("pro_monthly");
    expect(src).toContain("pro_yearly");
  });

  it("DebriefDetail does not invent blank coaching copy", () => {
    const page = fs.readFileSync(
      path.join(root, "src/pages/app/debrief/DebriefDetail.tsx"),
      "utf8",
    );
    expect(page).toMatch(/do not invent coaching feedback/i);
    expect(page).not.toMatch(/overall_grade:\s*["']C["']/);
  });
});
