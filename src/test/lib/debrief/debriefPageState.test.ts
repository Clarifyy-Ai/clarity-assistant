import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEBRIEF_EMPTY_COPY,
  buildDebriefListAccess,
  resolveDebriefPageState,
} from "@/lib/debrief/debriefPageState";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("resolveDebriefPageState", () => {
  it("initializes until user is ready", () => {
    expect(
      resolveDebriefPageState({
        userReady: false,
        loading: true,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 0,
        eligibleSessions: 0,
        totalCompletedSessions: 0,
      }),
    ).toBe("initializing");
  });

  it("returns available when debriefs exist", () => {
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 2,
        pendingCount: 0,
        processingCount: 0,
        eligibleSessions: 2,
        totalCompletedSessions: 2,
      }),
    ).toBe("available");
  });

  it("returns processing when jobs or pending exist", () => {
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 1,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("processing");
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 1,
        processingCount: 0,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("processing");
  });

  it("returns no_eligible_session when access ok but nothing to show", () => {
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 0,
        failedCount: 0,
        eligibleSessions: 0,
        totalCompletedSessions: 3,
      }),
    ).toBe("no_eligible_session");
  });

  it("returns available when only failed jobs exist", () => {
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 0,
        failedCount: 1,
        eligibleSessions: 1,
        totalCompletedSessions: 1,
      }),
    ).toBe("available");
  });

  it("returns plan_restricted when gated", () => {
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        planRestricted: true,
        debriefFetchFailed: false,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 0,
        eligibleSessions: 0,
        totalCompletedSessions: 0,
      }),
    ).toBe("plan_restricted");
  });

  it("returns temporary_failure on primary fetch failure", () => {
    expect(
      resolveDebriefPageState({
        userReady: true,
        loading: false,
        debriefFetchFailed: true,
        pendingFetchFailed: false,
        debriefCount: 0,
        pendingCount: 0,
        processingCount: 0,
        eligibleSessions: 0,
        totalCompletedSessions: 0,
      }),
    ).toBe("temporary_failure");
  });
});

describe("buildDebriefListAccess", () => {
  it("marks plan_restricted reason", () => {
    const access = buildDebriefListAccess({
      planId: "free",
      planRestricted: true,
      pageState: "plan_restricted",
    });
    expect(access.canViewDebrief).toBe(false);
    expect(access.reasonCode).toBe("FEATURE_NOT_AVAILABLE_FOR_PLAN");
  });
});

describe("Debrief empty-copy contracts", () => {
  it("empty copy mentions Practice Coach rehearsal eligibility", () => {
    expect(DEBRIEF_EMPTY_COPY.noEligibleDescription).toMatch(/Practice Coach/);
    expect(DEBRIEF_EMPTY_COPY.noEligibleDescription).toMatch(/rehearsal/);
  });

  it("never uses No more sessions on the Debrief page", () => {
    const page = fs.readFileSync(
      path.join(root, "pages/app/debrief/Debrief.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(/No more sessions/i);
    expect(page).toContain("DEBRIEF_EMPTY_COPY.noEligibleTitle");
    expect(page).toContain("DEBRIEF_EMPTY_COPY.temporaryFailureTitle");
    expect(page).not.toMatch(
      /listCompletedWithoutDebrief[\s\S]{0,80}\.catch\(\(err\)\s*=>\s*\{[\s\S]*?return\s*\[\]/,
    );
    expect(page).toContain("loadDebriefListPage");
  });

  it("capability copy does not claim Pro-or-higher for detailed_debrief", () => {
    const job = fs.readFileSync(path.join(root, "lib/debrief/debriefJob.ts"), "utf8");
    expect(job).not.toMatch(/Detailed debriefs require a Pro plan or higher/);
    const edge = fs.readFileSync(
      path.join(root, "../supabase/functions/_shared/sessionDebriefJob.ts"),
      "utf8",
    );
    expect(edge).not.toMatch(/Detailed debriefs require a Pro plan or higher/);
    const router = fs.readFileSync(
      path.join(root, "../supabase/functions/_shared/requireCapability.ts"),
      "utf8",
    );
    expect(router).toMatch(/detailed_debrief:\s*0/);
  });
});
