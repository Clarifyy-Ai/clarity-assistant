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
