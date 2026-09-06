/**
 * Canonical document AI failure classes.
 * Credits: invalid / unsupported / oversized never charge.
 * Provider / timeout / malformed refund if already reserved.
 */

export type DocumentFailureClass =
  | "invalid_file"
  | "unsupported_file"
  | "oversized"
  | "provider_failure"
  | "timeout"
  | "malformed_output";

export type DocumentCreditPolicy = "never" | "refund";

export const DOCUMENT_ERROR_CODES = {
  INVALID_FILE: "INVALID_FILE",
  EMPTY_FILE: "EMPTY_FILE",
  CORRUPT_FILE: "CORRUPT_FILE",
  ENCRYPTED_FILE: "ENCRYPTED_FILE",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  UNSUPPORTED_DOCUMENT_TYPE: "UNSUPPORTED_DOCUMENT_TYPE",
  DOCUMENT_UNRELATED: "DOCUMENT_UNRELATED",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  DOCUMENT_SIZE_INVALID: "DOCUMENT_SIZE_INVALID",
  PARSER_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PARSER_TIMEOUT: "PARSER_TIMEOUT",
  /** Client soft-wait ended while the durable job is still in flight — not a terminal failure. */
  CLIENT_WAIT_ELAPSED: "CLIENT_WAIT_ELAPSED",
  /** Durable job stayed queued — background worker did not claim in time. */
  QUEUE_WORKER_UNAVAILABLE: "QUEUE_WORKER_UNAVAILABLE",
  MALFORMED_OUTPUT: "MALFORMED_OUTPUT",
  PARSER_FAILED: "PARSER_FAILED",
} as const;

const ALIAS_TO_CANONICAL: Record<string, string> = {
  EMPTY_FILE: "INVALID_FILE",
  CORRUPT_FILE: "INVALID_FILE",
  ENCRYPTED_FILE: "INVALID_FILE",
  BAD_REQUEST: "INVALID_FILE",
  VALIDATION_ERROR: "INVALID_FILE",
  UNSUPPORTED_DOCUMENT_TYPE: "UNSUPPORTED_FILE_TYPE",
  DOCUMENT_UNRELATED: "UNSUPPORTED_FILE_TYPE",
  APPLICATION_MSWORD: "UNSUPPORTED_FILE_TYPE",
  DOCUMENT_SIZE_INVALID: "FILE_TOO_LARGE",
  AI_PROVIDER_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PYTHON_SERVICE_UNAVAILABLE: "PARSER_UNAVAILABLE",
  SERVICE_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PYTHON_SERVICE_UNAVAILABLE_ALIAS: "PARSER_UNAVAILABLE",
  AI_TIMEOUT: "PARSER_TIMEOUT",
  AI_INVALID_OUTPUT: "MALFORMED_OUTPUT",
  PYTHON_PROCESSING_FAILED: "MALFORMED_OUTPUT",
};

const CLASS_BY_CANONICAL: Record<string, DocumentFailureClass> = {
  INVALID_FILE: "invalid_file",
  UNSUPPORTED_FILE_TYPE: "unsupported_file",
  FILE_TOO_LARGE: "oversized",
  PARSER_UNAVAILABLE: "provider_failure",
  PARSER_TIMEOUT: "timeout",
  MALFORMED_OUTPUT: "malformed_output",
  PARSER_FAILED: "malformed_output",
};

export const DOCUMENT_FAILURE_MESSAGES: Record<string, string> = {
  INVALID_FILE: "This file is invalid or unreadable. Try another PDF, DOCX, or TXT.",
  EMPTY_FILE: "This file is empty.",
  CORRUPT_FILE: "The file is corrupt or unreadable.",
  ENCRYPTED_FILE: "This document is encrypted and cannot be read.",
  UNSUPPORTED_FILE_TYPE: "This file type is not supported.",
  UNSUPPORTED_DOCUMENT_TYPE: "This file type is not supported.",
  DOCUMENT_UNRELATED: "This file does not look like a resume, job description, or personal document.",
  FILE_TOO_LARGE: "This file is too large to process.",
  DOCUMENT_SIZE_INVALID: "This file is too large to process.",
  PARSER_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
  PARSER_TIMEOUT: "Document parsing timed out. You can retry.",
  CLIENT_WAIT_ELAPSED: "Still processing — refresh to check progress. No extra charge.",
  QUEUE_WORKER_UNAVAILABLE: "Background processing was slow — switching to direct parsing.",
  MALFORMED_OUTPUT: "The parser returned unusable output. You can retry.",
  PARSER_FAILED: "The document could not be parsed. Try another file or retry.",
  AI_PROVIDER_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
  PYTHON_SERVICE_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
  SERVICE_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
  PROVIDER_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
  AI_TIMEOUT: "Document parsing timed out. You can retry.",
  AI_INVALID_OUTPUT: "The parser returned unusable output. You can retry.",
  PYTHON_PROCESSING_FAILED: "The document could not be parsed. Try another file or retry.",
};

export function canonicalizeDocumentErrorCode(code: string | null | undefined): string {
  const raw = String(code ?? "").trim().toUpperCase();
  if (!raw) return "PARSER_FAILED";
  return ALIAS_TO_CANONICAL[raw] ?? raw;
}

export function documentFailureClass(code: string | null | undefined): DocumentFailureClass | null {
  const canonical = canonicalizeDocumentErrorCode(code);
  return CLASS_BY_CANONICAL[canonical] ?? null;
}

export function documentCreditPolicy(code: string | null | undefined): DocumentCreditPolicy {
  const klass = documentFailureClass(code);
  if (klass === "invalid_file" || klass === "unsupported_file" || klass === "oversized") {
    return "never";
  }
  return "refund";
}

export function isDocumentFailureRetryable(code: string | null | undefined): boolean {
  const klass = documentFailureClass(code);
  return klass === "provider_failure" || klass === "timeout" || klass === "malformed_output";
}

export function isKnownDocumentErrorCode(code: string | null | undefined): boolean {
  const raw = String(code ?? "").trim().toUpperCase();
  if (!raw) return false;
  if (raw in DOCUMENT_FAILURE_MESSAGES) return true;
  return documentFailureClass(raw) != null;
}

export function userFacingDocumentFailureMessage(code: string | null | undefined, fallback?: string | null): string {
  const raw = String(code ?? "").trim().toUpperCase();
  if (raw && DOCUMENT_FAILURE_MESSAGES[raw]) return DOCUMENT_FAILURE_MESSAGES[raw];
  const canonical = canonicalizeDocumentErrorCode(raw);
  if (DOCUMENT_FAILURE_MESSAGES[canonical]) return DOCUMENT_FAILURE_MESSAGES[canonical];
  const trimmed = String(fallback ?? "").trim();
  if (trimmed && trimmed !== "[object Object]") return trimmed;
  return DOCUMENT_FAILURE_MESSAGES.PARSER_FAILED;
}

export function httpStatusForDocumentError(code: string | null | undefined): number {
  const klass = documentFailureClass(code);
  switch (klass) {
    case "invalid_file":
    case "unsupported_file":
    case "oversized":
      return 400;
    case "malformed_output":
      return 422;
    case "timeout":
    case "provider_failure":
      return 503;
    default:
      return 500;
  }
}
