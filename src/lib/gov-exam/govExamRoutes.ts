/** Government Exam routes that may render before full profile bootstrap completes. */
export function isGovExamBrowsePath(pathname: string): boolean {
  return pathname === "/app/mock-test" || pathname.startsWith("/app/mock-test/");
}

export function canBrowseGovExamsBeforeProfileReady(input: {
  pathname: string;
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  accountPhase?: string;
  hasUser: boolean;
  mfaBlocked: boolean;
}): boolean {
  if (!isGovExamBrowsePath(input.pathname) || !input.hasUser || input.mfaBlocked) {
    return false;
  }
  if (input.status === "authenticated") return true;
  // Recoverable profile timeout must not unmount an in-flight paper job (DEF-013).
  return (
    input.accountPhase === "RECOVERY_REQUIRED" ||
    input.accountPhase === "ACCOUNT_LOADING" ||
    input.accountPhase === "READY"
  );
}

/** Keep Government Exam usable when profile bootstrap times out — auth is still required. */
export function canBrowseGovExamsDuringAccountRecovery(input: {
  pathname: string;
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  hasUser: boolean;
  mfaBlocked: boolean;
}): boolean {
  return (
    isGovExamBrowsePath(input.pathname) &&
    (input.status === "authenticated" || input.status === "error") &&
    input.hasUser &&
    !input.mfaBlocked
  );
}

/** Exam detail deep link — requires a non-empty registry code. */
export function govExamDetailPath(code: string): string | null {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return null;
  return `/app/mock-test/exam/${encodeURIComponent(trimmed)}`;
}

export type GovExamGeneratePathInput = {
  examId: string;
  stageId?: string | null;
  code: string;
  basis?: string | null;
  language?: string | null;
  questionCount?: number | null;
  topics?: string | null;
  jobId?: string | null;
};

/**
 * Paper generator deep link with encoded exam context.
 * Returns null when examId and code are both missing (nothing to generate for).
 */
export function govExamGeneratePath(input: GovExamGeneratePathInput): string | null {
  const examId = String(input.examId ?? "").trim();
  const code = String(input.code ?? "").trim();
  if (!examId && !code) return null;

  const q = new URLSearchParams();
  if (examId) q.set("examId", examId);
  const stageId = String(input.stageId ?? "").trim();
  if (stageId) q.set("stageId", stageId);
  if (code) q.set("code", code);
  const basis = String(input.basis ?? "").trim();
  if (basis) q.set("basis", basis);
  const language = String(input.language ?? "").trim();
  if (language) q.set("language", language);
  if (
    typeof input.questionCount === "number" &&
    Number.isFinite(input.questionCount) &&
    input.questionCount > 0
  ) {
    q.set("questionCount", String(Math.floor(input.questionCount)));
  }
  const topics = String(input.topics ?? "").trim();
  if (topics) q.set("topics", topics);
  const jobId = String(input.jobId ?? "").trim();
  if (jobId) q.set("jobId", jobId);

  const search = q.toString();
  return search ? `/app/mock-test/generate?${search}` : "/app/mock-test/generate";
}
