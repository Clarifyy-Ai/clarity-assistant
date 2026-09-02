/** HTTP statuses and API codes that are expected product outcomes, not incidents. */
export const EXPECTED_BUSINESS_FAILURE_CODES = [
  "INSUFFICIENT_CREDITS",
  "CONTENT_INSUFFICIENT",
  "SUBMISSION_CONFLICT",
  "QUESTION_INVENTORY_INSUFFICIENT",
  "MAX_ATTEMPTS_REACHED",
] as const;

const EXPECTED_BUSINESS_FAILURE_CODE_SET = new Set<string>(
  EXPECTED_BUSINESS_FAILURE_CODES,
);

export function isExpectedBusinessFailure(status: number, code?: string): boolean {
  if (status === 409) return true;
  if (typeof code !== "string") return false;
  const normalized = code.trim();
  return EXPECTED_BUSINESS_FAILURE_CODE_SET.has(normalized);
}
