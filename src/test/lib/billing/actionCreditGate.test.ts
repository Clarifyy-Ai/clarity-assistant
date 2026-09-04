import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateActionCreditGate,
  resolveCanonicalActionCost,
  creditGateUiMode,
} from "@/lib/billing/actionCreditGate";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { isInsufficientCreditsError } from "@/lib/network/aiErrorUx";
import { ApiClientError } from "@/lib/api/apiClient";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("actionCreditGate", () => {
  it("resolves catalogue costs without inventing unknown ops", () => {
    expect(resolveCanonicalActionCost("generate_scorecard")).toBe(
      AI_CREDIT_COSTS.generate_scorecard,
    );
    expect(resolveCanonicalActionCost("live_answer_long")).toBe(
      AI_CREDIT_COSTS.live_answer + 4,
    );
    expect(resolveCanonicalActionCost("not_a_real_op")).toBeUndefined();
  });

  it("allows when balance covers cost", () => {
    const result = evaluateActionCreditGate({
      operationKey: "live_hint",
      balance: 10,
      balanceKnown: true,
    });
    expect(result.status).toBe("allow");
  });

  it("blocks insufficient without treating as plan", () => {
    const result = evaluateActionCreditGate({
      operationKey: "company_research",
      balance: 5,
      balanceKnown: true,
    });
    expect(result.status).toBe("insufficient");
    if (result.status === "insufficient") {
      expect(result.cost).toBe(AI_CREDIT_COSTS.company_research);
      expect(result.balance).toBe(5);
    }
    expect(creditGateUiMode(result)).toBe("credits");
  });

  it("plan_blocked when planAllowed is false", () => {
    const result = evaluateActionCreditGate({
      operationKey: "company_research",
      balance: 100,
      planAllowed: false,
    });
    expect(result.status).toBe("plan_blocked");
    expect(creditGateUiMode(result)).toBe("plan");
  });

  it("unknown_operation for misspelled keys", () => {
    const result = evaluateActionCreditGate({
      operationKey: "typo_operation",
      balance: 100,
    });
    expect(result.status).toBe("unknown_operation");
    expect(creditGateUiMode(result)).toBe("unavailable");
  });
});

describe("insufficient credit error aliases", () => {
  it("treats CREDITS_EXHAUSTED and NO_CREDITS as insufficient credits", () => {
    expect(
      isInsufficientCreditsError(
        new ApiClientError({ message: "x", status: 422, code: "CREDITS_EXHAUSTED" }),
      ),
    ).toBe(true);
    expect(
      isInsufficientCreditsError(
        new ApiClientError({ message: "x", status: 402, code: "NO_CREDITS" }),
      ),
    ).toBe(true);
    expect(
      isInsufficientCreditsError(
        new ApiClientError({ message: "x", status: 403, code: "CAPABILITY_REQUIRED" }),
      ),
    ).toBe(false);
  });
});

describe("feature-level credit gating contracts", () => {
  it("wizard no longer replaces the whole UI with CreditExhaustedState", () => {
    const wizard = fs.readFileSync(
      path.join(root, "src/components/session/PreSessionSetupWizard.tsx"),
      "utf8",
    );
    expect(wizard).toContain("InsufficientCreditsAction");
    expect(wizard).not.toMatch(/if\s*\(\s*creditsExhausted\s*\)\s*\{[\s\S]*CreditExhaustedState/);
  });

  it("shared InsufficientCreditsAction exists with Buy Credits CTA", () => {
    const ui = fs.readFileSync(
      path.join(root, "src/components/billing/InsufficientCreditsAction.tsx"),
      "utf8",
    );
    expect(ui).toContain("Buy Credits");
    expect(ui).toContain("data-testid=\"buy-credits-cta\"");
    expect(ui).toContain("Not enough credits");
  });

  it("scorecard distinguishes INSUFFICIENT_CREDITS from evaluation failure", () => {
    const hook = fs.readFileSync(path.join(root, "src/hooks/useScorecard.ts"), "utf8");
    const page = fs.readFileSync(path.join(root, "src/pages/Scorecard.tsx"), "utf8");
    expect(hook).toContain("INSUFFICIENT_CREDITS");
    expect(page).toContain("InsufficientCreditsAction");
  });
});
