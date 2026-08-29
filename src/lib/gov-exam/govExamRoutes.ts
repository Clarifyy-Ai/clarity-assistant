/** Government Exam routes that may render before full profile bootstrap completes. */
export function isGovExamBrowsePath(pathname: string): boolean {
  return pathname === "/app/mock-test" || pathname.startsWith("/app/mock-test/");
}

export function canBrowseGovExamsBeforeProfileReady(input: {
  pathname: string;
  status: "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
  hasUser: boolean;
  mfaBlocked: boolean;
}): boolean {
  return (
    isGovExamBrowsePath(input.pathname) &&
    input.status === "authenticated" &&
    input.hasUser &&
    !input.mfaBlocked
  );
}
