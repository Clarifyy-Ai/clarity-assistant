import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifySessionCompletion,
  isAuthoritativeSessionComplete,
  resolveSessionShareability,
} from "@/lib/session/sessionShareability";
import { unscoredReasonLabel } from "@/lib/results/resultDisplay";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("BUG 18 — session shareability", () => {
  it("complete: finished + answers is complete and can be share-ready", () => {
    expect(
      isAuthoritativeSessionComplete({
        status: "completed",
        lifecycle_status: "COMPLETED",
        scorableAnswerCount: 3,
      }),
    ).toBe(true);

    const share = resolveSessionShareability({
      status: "completed",
      lifecycle_status: "COMPLETED",
      scorableAnswerCount: 3,
      privacyShareAllowed: true,
      hasScoredScorecard: true,
    });
    expect(share.code).toBe("SHARE_READY");
    expect(share.shareable).toBe(true);
  });

  it("complete-but-unscored says SCORECARD_REQUIRED, not incomplete", () => {
    const share = resolveSessionShareability({
      status: "completed",
      lifecycle_status: "COMPLETED",
      scorableAnswerCount: 2,
      privacyShareAllowed: true,
      hasScoredScorecard: false,
      hasShareableDebrief: false,
    });
    expect(share.completion).toBe("complete");
    expect(share.code).toBe("SCORECARD_REQUIRED");
    expect(share.message.toLowerCase()).not.toContain("incomplete");
    expect(share.message.toLowerCase()).toContain("scorecard");
  });

  it("incomplete: in-progress with no answers", () => {
    expect(classifySessionCompletion({
      status: "active",
      lifecycle_status: "IN_PROGRESS",
      scorableAnswerCount: 0,
    })).toBe("incomplete");

    const share = resolveSessionShareability({
      status: "active",
      lifecycle_status: "IN_PROGRESS",
      scorableAnswerCount: 0,
      privacyShareAllowed: true,
      hasScoredScorecard: false,
    });
    expect(share.code).toBe("SESSION_INCOMPLETE");
    expect(share.shareable).toBe(false);
  });

  it("abandoned: cancelled with no answers", () => {
    expect(classifySessionCompletion({
      status: "abandoned",
      lifecycle_status: "CANCELLED",
      terminal_reason: "CANCELLED",
      scorableAnswerCount: 0,
    })).toBe("abandoned");

    const share = resolveSessionShareability({
      status: "abandoned",
      lifecycle_status: "CANCELLED",
      terminal_reason: "CANCELLED",
      scorableAnswerCount: 0,
      privacyShareAllowed: true,
      hasScoredScorecard: false,
    });
    expect(share.code).toBe("SESSION_ABANDONED");
  });

  it("recovers false-CANCELLED sessions that still have answers", () => {
    expect(
      isAuthoritativeSessionComplete({
        status: "abandoned",
        lifecycle_status: "CANCELLED",
        terminal_reason: "CANCELLED",
        ended_at: "2026-09-04T12:00:00.000Z",
        scorableAnswerCount: 4,
      }),
    ).toBe(true);
  });

  it("privacy: share disabled blocks token", () => {
    const share = resolveSessionShareability({
      status: "completed",
      lifecycle_status: "COMPLETED",
      scorableAnswerCount: 2,
      privacyShareAllowed: false,
      hasScoredScorecard: true,
    });
    expect(share.code).toBe("SHARE_DISABLED");
    expect(share.shareable).toBe(false);
  });

  it("unscoredReasonLabel maps eligibility codes to human copy", () => {
    expect(unscoredReasonLabel({ eligibilityReason: "NOT_ELIGIBLE_INCOMPLETE_SESSION" })).toMatch(
      /completed session/i,
    );
    expect(unscoredReasonLabel({ eligibilityReason: "NOT_ELIGIBLE_INCOMPLETE_SESSION" })).not.toBe(
      "NOT_ELIGIBLE_INCOMPLETE_SESSION",
    );
  });

  it("issue-share-token edge enforces shareability codes and revoke", () => {
    const source = fs.readFileSync(
      path.join(root, "supabase/functions/issue-share-token/index.ts"),
      "utf8",
    );
    expect(source).toContain("resolveSessionShareability");
    expect(source).toContain("SESSION_INCOMPLETE");
    expect(source).toContain("SESSION_ABANDONED");
    expect(source).toContain("SCORECARD_REQUIRED");
    expect(source).toContain("SHARE_DISABLED");
    expect(source).toContain('action === "revoke"');
    expect(source).toContain("idempotent");
    expect(source).toContain("share_token");
  });

  it("generate-scorecard uses authoritative completion helper", () => {
    const source = fs.readFileSync(
      path.join(root, "supabase/functions/generate-scorecard/index.ts"),
      "utf8",
    );
    expect(source).toContain("isAuthoritativeSessionComplete");
    expect(source).not.toMatch(
      /sessionCompleted\s*=\s*[\s\S]{0,40}status === "completed" \|\|[\s\S]{0,40}lifecycle === "COMPLETED"/,
    );
  });
});
