import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateGovExamCreditGate } from "@/lib/gov-exam/govExamCreditGate";

const COST = 3;

describe("evaluateGovExamCreditGate", () => {
  it("blocks zero-credit users", () => {
    const gate = evaluateGovExamCreditGate({
      balance: 0,
      balanceKnown: true,
      cost: COST,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toBe("insufficient");
      expect(gate.balance).toBe(0);
      expect(gate.shortfall).toBe(COST);
    }
  });

  it("blocks below-cost balances", () => {
    const gate = evaluateGovExamCreditGate({
      balance: COST - 1,
      balanceKnown: true,
      cost: COST,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toBe("insufficient");
      expect(gate.shortfall).toBe(1);
    }
  });

  it("allows exact-cost balances", () => {
    const gate = evaluateGovExamCreditGate({
      balance: COST,
      balanceKnown: true,
      cost: COST,
    });
    expect(gate.allowed).toBe(true);
    if (gate.allowed) {
      expect(gate.balance).toBe(COST);
    }
  });

  it("allows sufficient balances", () => {
    const gate = evaluateGovExamCreditGate({
      balance: COST + 10,
      balanceKnown: true,
      cost: COST,
    });
    expect(gate.allowed).toBe(true);
    if (gate.allowed) {
      expect(gate.balance).toBe(COST + 10);
    }
  });

  it("fails closed when balance is unknown", () => {
    const gate = evaluateGovExamCreditGate({
      balance: null,
      balanceKnown: false,
      cost: COST,
    });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toBe("unknown_balance");
    }
  });
});

describe("GenerateGovPaper credit button gate", () => {
  it("disables Generate whenever the credit gate is closed, including unknown balance", () => {
    const src = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../pages/app/mock-test/GenerateGovPaper.tsx"),
      "utf8",
    );
    expect(src).toContain("!creditGate.allowed");
    expect(src).not.toContain("creditsKnown && !creditGate.allowed");
  });

  it("also guards the direct topic-practice action on GovExamDetail", () => {
    const src = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../pages/app/mock-test/GovExamDetail.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("evaluateGovExamCreditGate");
    expect(src).toContain("fetchSpendableCredits");
    expect(src).toContain("openUpgradeIfInsufficientCredits");
    expect(src).toContain("Top up to start");
    expect(src).toContain("/app/settings/billing");
  });
});
