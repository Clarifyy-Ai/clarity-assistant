import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeScoreStatus } from "@/lib/analytics/scoreStatus";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("create_scorecard_share RPC migration contract", () => {
  const sql = read("supabase/migrations/20260904180000_create_scorecard_share.sql");

  it("defines SECURITY DEFINER create_scorecard_share with owner + privacy checks", () => {
    expect(sql).toContain("create_scorecard_share(p_session_id UUID)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("sc.user_id = v_uid");
    expect(sql).toMatch(/share_scorecard/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_scorecard_share(UUID) TO authenticated");
    expect(sql).toContain("encode(gen_random_bytes(16), 'hex')");
    expect(sql).toContain("is_shared = TRUE");
  });
});

describe("scorecardsDB.createShare + useScorecard share/export wiring", () => {
  it("database helper calls create_scorecard_share RPC", () => {
    const db = read("src/lib/supabase/database.ts");
    expect(db).toContain('async createShare(sessionId: string)');
    expect(db).toContain('"create_scorecard_share"');
    expect(db).toContain("p_session_id: sessionId");
  });

  it("useScorecard shares via createShare and keeps exportPDF distinct from exportJSON", () => {
    const hook = read("src/hooks/useScorecard.ts");
    expect(hook).toContain("scorecardsDB.createShare(sessionId)");
    expect(hook).not.toContain("markShared(sessionId, userId, token)");
    expect(hook).toContain('import("@/lib/export/scorecardPdf")');
    expect(hook).toContain("exportScorecardPdf");
    expect(hook).toContain("const exportJSON = useCallback");
    expect(hook).toContain("const exportPDF = useCallback");
    expect(hook).not.toMatch(/exportPDF\s*=\s*exportJSON/);
  });
});

describe("SharedDebrief score display without fake score_status", () => {
  it("infers scored from overall_score when score_status is absent", () => {
    expect(normalizeScoreStatus(null, 72)).toBe("scored");
    expect(normalizeScoreStatus(undefined, 88)).toBe("scored");
    expect(normalizeScoreStatus("completed", 70)).toBe("scored");
  });

  it("page uses normalizeScoreStatus and does not gate on invented score_status alone", () => {
    const page = read("src/pages/marketing/SharedDebrief.tsx");
    expect(page).toContain("normalizeScoreStatus");
    expect(page).toContain("numericScore != null");
    expect(page).not.toContain('scorecard.score_status === "scored"');
  });
});

describe("Scorecard layout contract", () => {
  it("uses PageHeader and avoids nested min-h-screen shell", () => {
    const page = read("src/pages/Scorecard.tsx");
    expect(page).toContain('from "@/components/layout/PageHeader"');
    expect(page).toContain("<PageHeader");
    expect(page).toContain("Export PDF");
    expect(page).toContain('aria-label="Export scorecard as PDF"');
    expect(page).not.toContain("Export JSON");
    expect(page).not.toContain("min-h-screen");
    expect(page).toContain("PAGE_SHELL");
  });
});
