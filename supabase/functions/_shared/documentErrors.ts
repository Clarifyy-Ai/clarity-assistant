/**
 * Document parse failure taxonomy (Edge).
 * Keep in lockstep with src/lib/documents/documentFailure.ts.
 */

export type DocumentCreditPolicy = "never" | "refund";

const ALIAS_TO_CANONICAL: Record<string, string> = {
  EMPTY_FILE: "INVALID_FILE",
  CORRUPT_FILE: "INVALID_FILE",
  ENCRYPTED_FILE: "INVALID_FILE",
  BAD_REQUEST: "INVALID_FILE",
  VALIDATION_ERROR: "INVALID_FILE",
  UNSUPPORTED_DOCUMENT_TYPE: "UNSUPPORTED_FILE_TYPE",
  DOCUMENT_UNRELATED: "UNSUPPORTED_FILE_TYPE",
  DOCUMENT_SIZE_INVALID: "FILE_TOO_LARGE",
  AI_PROVIDER_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PYTHON_SERVICE_UNAVAILABLE: "PARSER_UNAVAILABLE",
  SERVICE_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PARSER_UNAVAILABLE",
  AI_TIMEOUT: "PARSER_TIMEOUT",
  AI_INVALID_OUTPUT: "MALFORMED_OUTPUT",
  PYTHON_PROCESSING_FAILED: "MALFORMED_OUTPUT",
};

export const DOCUMENT_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FILE: "This file is invalid or unreadable. Try another PDF, DOCX, or TXT.",
  EMPTY_FILE: "This file is empty.",
  CORRUPT_FILE: "The file is corrupt or unreadable.",
  ENCRYPTED_FILE: "This document is encrypted and cannot be read.",
  UNSUPPORTED_FILE_TYPE: "This file type is not supported.",
  DOCUMENT_UNRELATED: "This file does not look like a resume, job description, or personal document.",
  FILE_TOO_LARGE: "This file is too large to process.",
  DOCUMENT_SIZE_INVALID: "This file is too large to process.",
  PARSER_UNAVAILABLE: "Document parsing is temporarily unavailable. You can retry.",
  PARSER_TIMEOUT: "Document parsing timed out. You can retry.",
  MALFORMED_OUTPUT: "The parser returned unusable output. You can retry.",
  PARSER_FAILED: "The document could not be parsed. Try another file or retry.",
  AI_TIMEOUT: "Document parsing timed out. You can retry.",
  AI_INVALID_OUTPUT: "The parser returned unusable output. You can retry.",
};

export function canonicalizeDocumentErrorCode(code: string | null | undefined): string {
  const raw = String(code ?? "").trim().toUpperCase();
  if (!raw) return "PARSER_FAILED";
  return ALIAS_TO_CANONICAL[raw] ?? raw;
}

export function documentCreditPolicy(code: string | null | undefined): DocumentCreditPolicy {
  const canonical = canonicalizeDocumentErrorCode(code);
  if (
    canonical === "INVALID_FILE" ||
    canonical === "UNSUPPORTED_FILE_TYPE" ||
    canonical === "FILE_TOO_LARGE"
  ) {
    return "never";
  }
  return "refund";
}

export function isDocumentFailureRetryable(code: string | null | undefined): boolean {
  const canonical = canonicalizeDocumentErrorCode(code);
  return (
    canonical === "PARSER_UNAVAILABLE" ||
    canonical === "PARSER_TIMEOUT" ||
    canonical === "MALFORMED_OUTPUT" ||
    canonical === "PARSER_FAILED"
  );
}

export function documentErrorMessage(code: string, fallback?: string): string {
  const raw = String(code ?? "").trim().toUpperCase();
  if (DOCUMENT_ERROR_MESSAGES[raw]) return DOCUMENT_ERROR_MESSAGES[raw];
  const canonical = canonicalizeDocumentErrorCode(raw);
  return DOCUMENT_ERROR_MESSAGES[canonical] ?? fallback ?? DOCUMENT_ERROR_MESSAGES.PARSER_FAILED;
}

export function httpStatusForDocumentError(code: string | null | undefined): number {
  const canonical = canonicalizeDocumentErrorCode(code);
  if (canonical === "INVALID_FILE" || canonical === "UNSUPPORTED_FILE_TYPE" || canonical === "FILE_TOO_LARGE") {
    return 400;
  }
  if (canonical === "MALFORMED_OUTPUT" || canonical === "PARSER_FAILED") return 422;
  if (canonical === "PARSER_TIMEOUT" || canonical === "PARSER_UNAVAILABLE") return 503;
  return 500;
}

export function fileByteLengthFailure(
  byteLength: number,
  maxBytes: number,
): { code: "INVALID_FILE" | "FILE_TOO_LARGE"; message: string } | null {
  if (!byteLength) {
    return { code: "INVALID_FILE", message: DOCUMENT_ERROR_MESSAGES.EMPTY_FILE };
  }
  if (byteLength > maxBytes) {
    return {
      code: "FILE_TOO_LARGE",
      message: `File exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`,
    };
  }
  return null;
}

export function mapHybridDocumentCode(hybridCode: string | null | undefined): string {
  const raw = String(hybridCode ?? "").trim().toUpperCase();
  if (raw === "AI_TIMEOUT" || raw === "PARSER_TIMEOUT") return "PARSER_TIMEOUT";
  if (raw === "AI_INVALID_OUTPUT" || raw === "MALFORMED_OUTPUT") return "MALFORMED_OUTPUT";
  if (
    raw === "AI_PROVIDER_UNAVAILABLE" ||
    raw === "PYTHON_SERVICE_UNAVAILABLE" ||
    raw === "PROVIDER_UNAVAILABLE" ||
    raw === "SERVICE_UNAVAILABLE"
  ) {
    return "PARSER_UNAVAILABLE";
  }
  return canonicalizeDocumentErrorCode(raw);
}
