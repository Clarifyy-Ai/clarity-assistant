export type GovExamCreditGateInput = {
  balance: number | null;
  balanceKnown: boolean;
  cost: number;
};

export type GovExamCreditGateAllowed = {
  allowed: true;
  balance: number;
  cost: number;
};

export type GovExamCreditGateDenied = {
  allowed: false;
  reason: "unknown_balance" | "insufficient";
  balance: number | null;
  cost: number;
  shortfall: number;
};

export type GovExamCreditGateResult =
  | GovExamCreditGateAllowed
  | GovExamCreditGateDenied;

/** Client-side gate for gov-exam paper generation (mirrors server preflight rules). */
export function evaluateGovExamCreditGate(
  input: GovExamCreditGateInput,
): GovExamCreditGateResult {
  const cost = Math.max(0, Math.floor(input.cost));
  if (cost <= 0) {
    return { allowed: true, balance: input.balance ?? 0, cost };
  }
  if (!input.balanceKnown || input.balance == null) {
    return {
      allowed: false,
      reason: "unknown_balance",
      balance: input.balance,
      cost,
      shortfall: cost,
    };
  }
  const balance = Math.max(0, Math.floor(input.balance));
  if (balance < cost) {
    return {
      allowed: false,
      reason: "insufficient",
      balance,
      cost,
      shortfall: cost - balance,
    };
  }
  return { allowed: true, balance, cost };
}
