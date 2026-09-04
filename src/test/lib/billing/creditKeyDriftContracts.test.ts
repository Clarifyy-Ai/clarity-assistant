import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { CREDIT_COSTS as UI_CREDIT_COSTS } from "@/hooks/useCredits";
import { CREDIT_COSTS as MANAGER_COSTS, SERVER_AI_CREDIT_COSTS } from "@/lib/billing/creditsManager";
import { CREDIT_COSTS as PRICE_COSTS } from "@/lib/billing/priceCalculator";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readSharedEconomics(): string {
  return fs.readFileSync(
    path.join(root, "supabase/functions/_shared/creditEconomics.ts"),
    "utf8",
  );
}

/** Mirror Edge resolveActionCost for the Wave 8 drift keys (no Deno import). */
function resolveActionCostMirror(action: string): number | undefined {
  const normalized = action.trim().toLowerCase();
  if (normalized === "liveanswerlong" || normalized === "live_answer_long") {
    return AI_CREDIT_COSTS.live_answer + 4;
  }
  const map: Record<string, keyof typeof AI_CREDIT_COSTS> = {
    screenshot_answer: "screenshot_answer",
    screenshot_analyse: "screenshot_answer",
    gap_analysis: "gap_analysis",
    polish_star: "polish_star",
    polish_star_section: "polish_star",
    star_analyse: "polish_star",
    generate_scorecard: "generate_scorecard",
    scorecard_generate: "generate_scorecard",
    session_debrief: "session_debrief",
    generate_debrief: "session_debrief",
    live_answer: "live_answer",
  };
  const key = map[normalized];
  return key ? AI_CREDIT_COSTS[key] : undefined;
}

describe("Wave 8 FE vs Edge credit key drift contracts", () => {
  it("catalog values match across FE and Edge source", () => {
    const edge = readSharedEconomics();
    for (const [key, value] of Object.entries(AI_CREDIT_COSTS)) {
      expect(edge).toMatch(new RegExp(`${key}:\\s*${value}`));
    }
  });

  it("resolveActionCost maps screenshot / long / gap / polish / scorecard vs debrief", () => {
    expect(resolveActionCostMirror("screenshot_answer")).toBe(10);
    expect(resolveActionCostMirror("screenshot_analyse")).toBe(10);
    expect(resolveActionCostMirror("liveanswerlong")).toBe(12);
    expect(resolveActionCostMirror("live_answer_long")).toBe(12);
    expect(resolveActionCostMirror("gap_analysis")).toBe(10);
    expect(resolveActionCostMirror("polish_star")).toBe(2);
    expect(resolveActionCostMirror("polish_star_section")).toBe(2);
    expect(resolveActionCostMirror("star_analyse")).toBe(2);
    expect(resolveActionCostMirror("generate_scorecard")).toBe(15);
    expect(resolveActionCostMirror("scorecard_generate")).toBe(15);
    expect(resolveActionCostMirror("session_debrief")).toBe(15);
    expect(resolveActionCostMirror("generate_debrief")).toBe(15);
    // Distinct identities even when numeric cost matches
    expect(resolveActionCostMirror("generate_scorecard")).toBe(
      resolveActionCostMirror("session_debrief"),
    );
  });

  it("Edge resolveActionCost includes polish_star_section alias", () => {
    const edge = readSharedEconomics();
    expect(edge).toContain('polish_star_section: "polish_star"');
    expect(edge).toContain('scorecard_generate: "generate_scorecard"');
    expect(edge).toMatch(/liveanswerlong[\s\S]*live_answer_long/);
  });

  it("FE affordability maps align to catalog for drift keys", () => {
    expect(UI_CREDIT_COSTS.screenshot_analyse).toBe(AI_CREDIT_COSTS.screenshot_answer);
    expect(UI_CREDIT_COSTS.live_answer_long).toBe(AI_CREDIT_COSTS.live_answer + 4);
    expect(UI_CREDIT_COSTS.gap_analysis).toBe(AI_CREDIT_COSTS.gap_analysis);
    expect(UI_CREDIT_COSTS.star_analyse).toBe(AI_CREDIT_COSTS.polish_star);
    expect(UI_CREDIT_COSTS.scorecard_generate).toBe(AI_CREDIT_COSTS.generate_scorecard);
    expect(UI_CREDIT_COSTS.generate_debrief).toBe(AI_CREDIT_COSTS.session_debrief);
    expect(MANAGER_COSTS.liveanswerlong).toBe(12);
    expect(SERVER_AI_CREDIT_COSTS.screenshotAnswer).toBe(10);
    expect(SERVER_AI_CREDIT_COSTS.longAnswer).toBe(12);
    expect(PRICE_COSTS.gap_analysis).toBe(10);
    expect(PRICE_COSTS.polish_star).toBe(2);
    expect(PRICE_COSTS.generate_scorecard).toBe(15);
  });

  it("generate-scorecard and generate-debrief charge distinct catalog keys", () => {
    const scorecard = fs.readFileSync(
      path.join(root, "supabase/functions/generate-scorecard/index.ts"),
      "utf8",
    );
    const debrief = fs.readFileSync(
      path.join(root, "supabase/functions/generate-debrief/index.ts"),
      "utf8",
    );
    expect(scorecard).toContain('creditCost("generate_scorecard")');
    expect(debrief).toContain('creditCost("session_debrief")');
    expect(scorecard).not.toContain('creditCost("session_debrief")');
  });
});
