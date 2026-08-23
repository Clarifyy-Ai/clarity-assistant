/**
 * Map database / PostgREST failures to safe user-facing copy.
 * Never expose raw SQL, PostgREST codes, or internal exception text.
 */

const SAFE_LOAD = "We couldn't load your data. Please try again.";
const SAFE_SAVE = "We couldn't save your changes. Please try again.";
const SAFE_DELETE = "We couldn't delete that item. Please try again.";
const SAFE_GENERIC = "Something went wrong. Please try again.";

export type DbUserFacingKind = "load" | "save" | "delete" | "generic";

export function userFacingDbError(
  _err: unknown,
  kind: DbUserFacingKind = "generic",
): string {
  switch (kind) {
    case "load":
      return SAFE_LOAD;
    case "save":
      return SAFE_SAVE;
    case "delete":
      return SAFE_DELETE;
    default:
      return SAFE_GENERIC;
  }
}

export function answerBankLoadErrorMessage(productLabel = "Answer Bank"): string {
  return `We couldn't load your ${productLabel}.`;
}

export function answerBankEmptyTitle(productLabel = "Answer Bank"): string {
  return `Your ${productLabel} is empty.`;
}
