/**
 * Question-bank coverage for full-pattern simulations.
 * Status is derived from public+verified counts vs pattern total_questions.
 */

export type BankReadinessStatus = "ready" | "partial" | "empty";

export type BankReadinessInput = {
  approvedPublicCount: number;
  requiredQuestions: number;
};

export type BankReadinessSnapshot = BankReadinessInput & {
  status: BankReadinessStatus;
  fullSimulationAvailable: boolean;
  coverageRatio: number;
};

/** Pure status from counts — empty | partial | ready. */
export function computeBankReadinessStatus(
  approvedPublicCount: number,
  requiredQuestions: number,
): BankReadinessStatus {
  const available = Math.max(0, Math.floor(Number(approvedPublicCount) || 0));
  const required = Math.max(0, Math.floor(Number(requiredQuestions) || 0));

  if (available <= 0) return "empty";
  if (required <= 0) return "partial";
  if (available >= required) return "ready";
  return "partial";
}

export function isFullSimulationAvailable(
  approvedPublicCount: number,
  requiredQuestions: number,
): boolean {
  return computeBankReadinessStatus(approvedPublicCount, requiredQuestions) === "ready";
}

export function buildBankReadinessSnapshot(
  input: BankReadinessInput,
): BankReadinessSnapshot {
  const approvedPublicCount = Math.max(
    0,
    Math.floor(Number(input.approvedPublicCount) || 0),
  );
  const requiredQuestions = Math.max(
    0,
    Math.floor(Number(input.requiredQuestions) || 0),
  );
  const status = computeBankReadinessStatus(approvedPublicCount, requiredQuestions);
  const coverageRatio =
    requiredQuestions > 0
      ? Math.min(1, approvedPublicCount / requiredQuestions)
      : approvedPublicCount > 0
        ? 1
        : 0;

  return {
    approvedPublicCount,
    requiredQuestions,
    status,
    fullSimulationAvailable: status === "ready",
    coverageRatio,
  };
}

export function bankReadinessLabel(status: BankReadinessStatus): string {
  switch (status) {
    case "ready":
      return "Bank ready for full simulation";
    case "partial":
      return "Partial bank — full simulation unavailable";
    case "empty":
      return "No public approved questions";
  }
}

export function formatBankCoverage(
  approvedPublicCount: number,
  requiredQuestions: number,
): string {
  const req = Math.max(0, Math.floor(Number(requiredQuestions) || 0));
  const avail = Math.max(0, Math.floor(Number(approvedPublicCount) || 0));
  if (req <= 0) return `${avail} approved in bank`;
  return `${avail}/${req} approved in bank`;
}
