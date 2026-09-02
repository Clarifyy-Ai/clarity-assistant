import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  canonicalizeDocumentErrorCode,
  documentCreditPolicy,
  documentFailureClass,
  isDocumentFailureRetryable,
  userFacingDocumentFailureMessage,
} from "@/lib/documents/documentFailure";
import { userFacingDocumentError } from "@/lib/documents/processingJobs";

describe("document failure taxonomy", () => {
  it("maps aliases to canonical classes", () => {
    expect(canonicalizeDocumentErrorCode("EMPTY_FILE")).toBe("INVALID_FILE");
    expect(canonicalizeDocumentErrorCode("ENCRYPTED_FILE")).toBe("INVALID_FILE");
    expect(canonicalizeDocumentErrorCode("DOCUMENT_UNRELATED")).toBe("UNSUPPORTED_FILE_TYPE");
    expect(canonicalizeDocumentErrorCode("AI_TIMEOUT")).toBe("PARSER_TIMEOUT");
    expect(canonicalizeDocumentErrorCode("AI_INVALID_OUTPUT")).toBe("MALFORMED_OUTPUT");
    expect(documentFailureClass("FILE_TOO_LARGE")).toBe("oversized");
    expect(documentFailureClass("PARSER_UNAVAILABLE")).toBe("provider_failure");
  });

  it("never charges invalid, unsupported, or oversized failures", () => {
    expect(documentCreditPolicy("INVALID_FILE")).toBe("never");
    expect(documentCreditPolicy("EMPTY_FILE")).toBe("never");
    expect(documentCreditPolicy("UNSUPPORTED_FILE_TYPE")).toBe("never");
    expect(documentCreditPolicy("DOCUMENT_UNRELATED")).toBe("never");
    expect(documentCreditPolicy("FILE_TOO_LARGE")).toBe("never");
  });

  it("refunds provider, timeout, and malformed failures", () => {
    expect(documentCreditPolicy("PARSER_UNAVAILABLE")).toBe("refund");
    expect(documentCreditPolicy("PARSER_TIMEOUT")).toBe("refund");
    expect(documentCreditPolicy("AI_TIMEOUT")).toBe("refund");
    expect(documentCreditPolicy("MALFORMED_OUTPUT")).toBe("refund");
    expect(documentCreditPolicy("AI_INVALID_OUTPUT")).toBe("refund");
  });

  it("is retryable only for provider, timeout, and malformed classes", () => {
    expect(isDocumentFailureRetryable("INVALID_FILE")).toBe(false);
    expect(isDocumentFailureRetryable("UNSUPPORTED_FILE_TYPE")).toBe(false);
    expect(isDocumentFailureRetryable("FILE_TOO_LARGE")).toBe(false);
    expect(isDocumentFailureRetryable("PARSER_UNAVAILABLE")).toBe(true);
    expect(isDocumentFailureRetryable("PARSER_TIMEOUT")).toBe(true);
    expect(isDocumentFailureRetryable("MALFORMED_OUTPUT")).toBe(true);
  });

  it("returns classified user-facing copy", () => {
    expect(userFacingDocumentFailureMessage("FILE_TOO_LARGE")).toMatch(/too large/i);
    expect(userFacingDocumentFailureMessage("PARSER_TIMEOUT")).toMatch(/timed out/i);
    expect(userFacingDocumentFailureMessage("DOCUMENT_UNRELATED")).toMatch(/does not look like/i);
    const timeoutErr = new ApiClientError({
      message: "raw",
      status: 503,
      code: "PARSER_TIMEOUT",
    });
    expect(userFacingDocumentError(timeoutErr)).toMatch(/timed out/i);
  });
});
