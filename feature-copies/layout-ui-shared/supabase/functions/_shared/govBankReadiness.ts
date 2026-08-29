/** Mirrors src/lib/gov-exam/bankReadiness.ts for edge functions. */

export type BankReadinessStatus = "ready" | "partial" | "empty";

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

export type BankReadinessPayload = {
  approvedPublicCount: number;
  publicCount: number;
  requiredQuestions: number;
  status: BankReadinessStatus;
  fullSimulationAvailable: boolean;
};

export function toBankReadinessPayload(row: {
  approved_public_count?: number | null;
  public_count?: number | null;
  required_questions?: number | null;
  status?: string | null;
  full_simulation_available?: boolean | null;
}): BankReadinessPayload {
  const approvedPublicCount = Math.max(0, Number(row.approved_public_count) || 0);
  const publicCount = Math.max(0, Number(row.public_count) || 0);
  const requiredQuestions = Math.max(0, Number(row.required_questions) || 0);
  const status =
    row.status === "ready" || row.status === "partial" || row.status === "empty"
      ? row.status
      : computeBankReadinessStatus(approvedPublicCount, requiredQuestions);

  return {
    approvedPublicCount,
    publicCount,
    requiredQuestions,
    status,
    fullSimulationAvailable:
      typeof row.full_simulation_available === "boolean"
        ? row.full_simulation_available
        : status === "ready",
  };
}
