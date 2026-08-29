import { describe, expect, it } from "vitest";
import {
  buildBankReadinessSnapshot,
  computeBankReadinessStatus,
  formatBankCoverage,
  isFullSimulationAvailable,
} from "@/lib/gov-exam/bankReadiness";

describe("computeBankReadinessStatus", () => {
  it("returns empty when no approved questions", () => {
    expect(computeBankReadinessStatus(0, 100)).toBe("empty");
    expect(computeBankReadinessStatus(-3, 100)).toBe("empty");
  });

  it("returns ready when bank meets or exceeds pattern total", () => {
    expect(computeBankReadinessStatus(100, 100)).toBe("ready");
    expect(computeBankReadinessStatus(120, 100)).toBe("ready");
  });

  it("returns partial when some questions exist but below pattern total", () => {
    expect(computeBankReadinessStatus(1, 100)).toBe("partial");
    expect(computeBankReadinessStatus(99, 100)).toBe("partial");
  });

  it("returns partial when required is zero but bank has items", () => {
    expect(computeBankReadinessStatus(5, 0)).toBe("partial");
  });

  it("coerces non-numeric inputs safely", () => {
    expect(computeBankReadinessStatus(Number.NaN, 100)).toBe("empty");
    expect(computeBankReadinessStatus(50.9, 50.1)).toBe("ready");
  });
});

describe("isFullSimulationAvailable / snapshot", () => {
  it("gates full simulation on ready only", () => {
    expect(isFullSimulationAvailable(100, 100)).toBe(true);
    expect(isFullSimulationAvailable(99, 100)).toBe(false);
    expect(isFullSimulationAvailable(0, 100)).toBe(false);
  });

  it("builds snapshot with coverage ratio capped at 1", () => {
    const snap = buildBankReadinessSnapshot({
      approvedPublicCount: 25,
      requiredQuestions: 100,
    });
    expect(snap.status).toBe("partial");
    expect(snap.fullSimulationAvailable).toBe(false);
    expect(snap.coverageRatio).toBe(0.25);

    const ready = buildBankReadinessSnapshot({
      approvedPublicCount: 150,
      requiredQuestions: 100,
    });
    expect(ready.status).toBe("ready");
    expect(ready.coverageRatio).toBe(1);
  });

  it("formats coverage string for UI", () => {
    expect(formatBankCoverage(12, 100)).toBe("12/100 approved in bank");
    expect(formatBankCoverage(0, 100)).toBe("0/100 approved in bank");
  });
});
