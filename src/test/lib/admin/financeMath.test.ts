import { describe, expect, it } from "vitest";
import {
  classifyFeatureMargin,
  computeContributionProfit,
  estimatePaymentFeesPaise,
  maskCredentialIdentifier,
  periodBounds,
  redactSecrets,
  usdMicrocentsToInrPaise,
} from "@/lib/admin/financeMath";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("financeMath contribution", () => {
  it("subtracts known fees and api costs", () => {
    const result = computeContributionProfit({
      grossRevenuePaise: 100_000,
      refundsPaise: 5_000,
      paymentFees: { amountPaise: 2_000, quality: "estimated", label: "Estimated" },
      apiCostPaise: { amountPaise: 10_000, quality: "estimated", label: "Estimated" },
      variableInfraPaise: { amountPaise: null, quality: "not_configured", label: "n/a" },
    });
    expect(result.contributionProfitPaise).toBe(83_000);
    expect(result.excludedReasons.some((r) => r.includes("variable_infra"))).toBe(true);
    expect(result.fixedOpexConfigured).toBe(false);
  });

  it("does not treat not_configured fees as zero", () => {
    const fees = estimatePaymentFeesPaise(100_000, null, null);
    expect(fees.quality).toBe("not_configured");
    expect(fees.amountPaise).toBeNull();
    const result = computeContributionProfit({
      grossRevenuePaise: 100_000,
      refundsPaise: 0,
      paymentFees: fees,
      apiCostPaise: { amountPaise: 1_000, quality: "estimated", label: "Estimated" },
      variableInfraPaise: { amountPaise: null, quality: "not_configured", label: "n/a" },
    });
    expect(result.contributionProfitPaise).toBe(99_000);
    expect(result.excludedReasons).toContain("payment_fees:not_configured");
  });

  it("converts usd microcents to inr paise", () => {
    // 1 USD = 1_000_000 microcents → 83 INR → 8300 paise at FX 83
    expect(usdMicrocentsToInrPaise(1_000_000, 83)).toBe(8300);
  });

  it("classifies margins with UNKNOWN when revenue missing", () => {
    expect(classifyFeatureMargin(null, 100)).toBe("UNKNOWN");
    expect(classifyFeatureMargin(200, 100)).toBe("PROFITABLE");
    expect(classifyFeatureMargin(100, 200)).toBe("LOSS_MAKING");
    expect(classifyFeatureMargin(100, 100)).toBe("BREAK_EVEN");
  });

  it("redacts secret-like keys", () => {
    const out = redactSecrets({ apiKey: "sk-secret", nested: { webhook_secret: "x" }, ok: 1 });
    expect(out.apiKey).toBe("[REDACTED]");
    expect((out.nested as { webhook_secret: string }).webhook_secret).toBe("[REDACTED]");
    expect(out.ok).toBe(1);
  });

  it("masks credential identifiers", () => {
    expect(maskCredentialIdentifier("abcdefghijklmnop")).toBe("••••••••mnop");
    expect(maskCredentialIdentifier("ab")).toBeNull();
  });

  it("periodBounds all_time starts at epoch", () => {
    const b = periodBounds("all_time", Date.parse("2026-09-04T12:00:00Z"));
    expect(b.fromIso.startsWith("1970")).toBe(true);
  });
});

describe("credit mismatch fixes", () => {
  it("aligns gap_analysis client map to server 10", () => {
    expect(CREDIT_COSTS.gap_analysis).toBe(AI_CREDIT_COSTS.gap_analysis);
    expect(CREDIT_COSTS.gap_analysis).toBe(10);
  });

  it("splits scorecard from debrief catalog keys", () => {
    expect(AI_CREDIT_COSTS.generate_scorecard).toBe(15);
    expect(AI_CREDIT_COSTS.session_debrief).toBe(15);
    expect(CREDIT_COSTS.scorecard_generate).toBe(AI_CREDIT_COSTS.generate_scorecard);
    expect(CREDIT_COSTS.generate_debrief).toBe(AI_CREDIT_COSTS.session_debrief);
  });

  it("keeps polish_star distinct from rephraser and star_builder", () => {
    expect(AI_CREDIT_COSTS.polish_star).toBe(2);
    expect(AI_CREDIT_COSTS.rephraser).toBe(3);
    expect(AI_CREDIT_COSTS.star_builder).toBe(10);
    expect(CREDIT_COSTS.star_analyse).toBe(AI_CREDIT_COSTS.polish_star);
    expect(CREDIT_COSTS.live_answer_long).toBe(AI_CREDIT_COSTS.live_answer + 4);
    expect(CREDIT_COSTS.screenshot_analyse).toBe(AI_CREDIT_COSTS.screenshot_answer);
  });

  it("PrepLab section polish calls polish-star-section (polish_star), not prep-tool raw_prompt", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/prep/PrepLab.tsx"),
      "utf8",
    );
    expect(src).toContain('"polish-star-section"');
    expect(src).toContain("canAfford(\"star_analyse\")");
    const polishFn = src.slice(src.indexOf("async function polishSection"));
    expect(polishFn).toContain('"polish-star-section"');
    expect(polishFn).not.toContain('tool_id: "raw_prompt"');
  });

  it("Live Copilot full-answer precheck uses screenshotAnswer when capture present", () => {
    const src = fs.readFileSync(
      path.join(root, "src/hooks/useLiveCopilot.ts"),
      "utf8",
    );
    expect(src).toContain('screenshotBase64 ? "screenshotAnswer" : "fullAnswer"');
  });

  it("generate-answer charges screenshot or long dynamically", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/generate-answer/index.ts"),
      "utf8",
    );
    expect(src).toContain("COST_SCREENSHOT");
    expect(src).toContain('creditAction = hasScreenshot');
    expect(src).toContain("chargeCost");
    expect(src).not.toMatch(/creditCost: COST,/);
  });

  it("generate-scorecard uses generate_scorecard cost key", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/generate-scorecard/index.ts"),
      "utf8",
    );
    expect(src).toContain('creditCost("generate_scorecard")');
  });
});

describe("admin finance security contract", () => {
  it("edge report never returns secret env values", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/admin-finance-report/index.ts"),
      "utf8",
    );
    expect(src).toContain("enforceAdmin");
    expect(src).toContain("maskCredentialIdentifier");
    expect(src).toContain("redactSecrets");
    expect(src).not.toMatch(/Deno\.env\.get\([^)]+\)\s*,/);
    expect(src).toContain('quality: "not_configured"');
  });

  it("admin finance page is wired", () => {
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    const layout = fs.readFileSync(path.join(root, "src/pages/app/admin/AdminLayout.tsx"), "utf8");
    expect(app).toContain('path: "finance"');
    expect(layout).toContain("/app/admin/finance");
  });
});
