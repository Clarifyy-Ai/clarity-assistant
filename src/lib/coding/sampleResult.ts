import type { SolveCaseResult, SolveExecutionStatus } from "@/lib/coding/javascriptSolveRunner";

export function formatCodingExecutionSummary(input: {
  execution_status?: SolveExecutionStatus | string;
  message?: string;
  blocked_reason?: string;
  primary_error?: string;
  passed_tests?: number;
  failed_tests?: number;
  case_results?: SolveCaseResult[];
}): string {
  const status = String(input.execution_status ?? "");
  const detail = input.primary_error || input.blocked_reason || input.message;

  switch (status) {
    case "compile_error":
      return `Compile error${detail ? `: ${detail}` : "."}`;
    case "runtime_error":
      return `Runtime error${detail ? `: ${detail}` : "."}`;
    case "timeout":
      return detail ? `Timed out: ${detail}` : "Timed out.";
    case "service_error":
      return detail ?? "The code runner is temporarily unavailable. Please try again.";
    case "unsupported":
      return detail ?? "Language not supported for automated scoring.";
    case "blocked":
      return detail ?? "Execution blocked.";
    case "passed":
      return (
        input.message ??
        `All sample tests passed (${input.passed_tests ?? 0}/${(input.passed_tests ?? 0) + (input.failed_tests ?? 0)}).`
      );
    case "failed":
      return (
        detail ??
        input.message ??
        `Sample: ${input.passed_tests ?? 0} passed, ${input.failed_tests ?? 0} failed.`
      );
    default:
      return detail ?? (status ? `Status: ${status}` : "No result.");
  }
}

export function isCodingInfrastructureFailure(status?: string): boolean {
  return status === "service_error" || status === "blocked";
}
