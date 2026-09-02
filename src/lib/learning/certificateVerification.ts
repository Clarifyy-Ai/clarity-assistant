import { PRODUCT_NAMES } from "@/lib/constants/productNames";

export const CERTIFICATE_CODE_PATTERN = /^CLR-\d{4}-[A-F0-9]{8}$/i;

export type CertificateVerifyPayload = {
  valid: boolean;
  certificate_code?: string;
  student_name?: string;
  course_name?: string;
  issued_at?: string;
  course_duration_hours?: number | null;
  completion_percentage?: number;
  kind?: string;
};

export type CertificateRouteKind = "missing" | "malformed" | "ready";

export type CertificateVerifyStatus =
  | "idle"
  | "loading"
  | "valid"
  | "invalid"
  | "malformed"
  | "error";

const SAFE_VERIFY_ERROR =
  "We could not verify this certificate right now. Please try again in a moment.";

const TECHNICAL_ERROR_PATTERNS = [
  /sql/i,
  /postgres/i,
  /permission denied/i,
  /row[- ]level security/i,
  /\bjwt\b/i,
  /pgrst/i,
  /stack trace/i,
  /internal server/i,
  /violates/i,
  /function\s+verify_course_certificate/i,
];

export function normalizeCertificateCode(raw?: string | null): string {
  return raw?.trim() ?? "";
}

export function isCertificateCodeFormatValid(code: string): boolean {
  const normalized = normalizeCertificateCode(code);
  if (!normalized) return false;
  return CERTIFICATE_CODE_PATTERN.test(normalized);
}

export function classifyRouteCertificateCode(
  raw?: string | null,
): CertificateRouteKind {
  const code = normalizeCertificateCode(raw);
  if (!code) return "missing";
  if (!isCertificateCodeFormatValid(code)) return "malformed";
  return "ready";
}

export function safeCertificateVerifyErrorMessage(raw?: string | null): string {
  const message = raw?.trim();
  if (!message) return SAFE_VERIFY_ERROR;
  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return SAFE_VERIFY_ERROR;
  }
  if (message.length > 160 || /[{[\]}/\\]/.test(message)) {
    return SAFE_VERIFY_ERROR;
  }
  return SAFE_VERIFY_ERROR;
}

export function resolveVerifyStatusFromRpc(
  payload: CertificateVerifyPayload | null,
  rpcError: { message?: string } | null,
): { status: Extract<CertificateVerifyStatus, "valid" | "invalid" | "error">; error: string | null } {
  if (rpcError) {
    return {
      status: "error",
      error: safeCertificateVerifyErrorMessage(rpcError.message),
    };
  }
  if (!payload?.valid) {
    return { status: "invalid", error: null };
  }
  return { status: "valid", error: null };
}

export function certificateNotFoundCopy(): { title: string; description: string } {
  return {
    title: "Certificate not found",
    description:
      `${PRODUCT_NAMES.brand} could not match this verification code. Learner names, course titles, and completion details are not shown for invalid codes.`,
  };
}

export function certificateMalformedCopy(): { title: string; description: string } {
  return {
    title: "Invalid certificate code",
    description:
      "This link does not include a valid verification code. Certificate IDs use the format CLR-YYYY-XXXXXXXX (for example, CLR-2026-AB12CD34).",
  };
}
