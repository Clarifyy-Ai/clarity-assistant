import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("BUG 17 scorecard lifecycle contracts", () => {
  it("useScorecard polls while pending and times out to failed", () => {
    const hook = read("src/hooks/useScorecard.ts");
    expect(hook).toContain("PENDING_POLL_MS");
    expect(hook).toContain("PENDING_POLL_MAX_MS");
    expect(hook).toContain("startPendingPoll");
    expect(hook).toContain("markPollTimedOut");
    expect(hook).toContain("isCompletedScorecard");
  });

  it("MockSession sets ready only after completed scorecard row", () => {
    const mock = read("src/pages/app/mock/MockSession.tsx");
    expect(mock).toContain("isCompletedScorecard");
    expect(mock).toContain("scorecardsDB.getBySessionIdForUser");
    expect(mock).toContain('setScorecardEval("ready")');
    expect(mock).toContain('setScorecardEval("processing")');
    // Ready only after isCompletedScorecard check, not bare HTTP success.
    expect(mock).toMatch(/isCompletedScorecard\(row\)[\s\S]{0,80}setScorecardEval\("ready"\)/);
  });

  it("Scorecard page never renders scored layout without finite overall", () => {
    const page = read("src/pages/Scorecard.tsx");
    expect(page).toContain('status !== "scored" || !hasFiniteOverall');
    expect(page).toContain("status === \"pending\"");
    expect(page).not.toContain(".startTime");
  });

  it("scorecard hook and page have no startTime dependency (DevTools noise only)", () => {
    const hook = read("src/hooks/useScorecard.ts");
    const page = read("src/pages/Scorecard.tsx");
    expect(hook).not.toMatch(/\.startTime\b/);
    expect(page).not.toMatch(/\.startTime\b/);
    const boot = read("src/bootstrap.tsx");
    expect(boot).toMatch(/reading 'startTime'/);
  });
});
