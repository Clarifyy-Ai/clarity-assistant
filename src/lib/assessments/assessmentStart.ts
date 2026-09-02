import { ApiClientError } from "@/lib/api/apiClient";

export const ASSESSMENT_START_ERROR_CODES = [
  "INVALID_PAYLOAD",
  "ASSESSMENT_NOT_FOUND",
  "ASSESSMENT_NOT_AVAILABLE",
  "ASSESSMENT_NOT_ELIGIBLE",
  "INVALID_ASSESSMENT_TEMPLATE",
  "INSUFFICIENT_QUESTION_INVENTORY",
  "MAX_ATTEMPTS_REACHED",
  "CAPABILITY_REQUIRED",
  "ASSESSMENT_START_FAILED",
  "UNAUTHORIZED",
  "ORIGIN_NOT_ALLOWED",
] as const;

export type AssessmentStartErrorCode = (typeof ASSESSMENT_START_ERROR_CODES)[number];

export const ASSESSMENT_START_HTTP: Record<AssessmentStartErrorCode, number> = {
  INVALID_PAYLOAD: 400,
  UNAUTHORIZED: 401,
  ORIGIN_NOT_ALLOWED: 403,
  ASSESSMENT_NOT_ELIGIBLE: 403,
  MAX_ATTEMPTS_REACHED: 403,
  CAPABILITY_REQUIRED: 403,
  ASSESSMENT_NOT_FOUND: 404,
  ASSESSMENT_NOT_AVAILABLE: 404,
  INVALID_ASSESSMENT_TEMPLATE: 422,
  INSUFFICIENT_QUESTION_INVENTORY: 409,
  ASSESSMENT_START_FAILED: 500,
};

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssessmentStartRequest = {
  template_id: string;
  idempotency_key?: string;
};

export type AssessmentStartSuccess = {
  test_id: string;
  question_count: number;
  duration_minutes: number;
  reused?: boolean;
  template_slug?: string;
};

export type AssessmentStartErrorBody = {
  error: string;
  code: AssessmentStartErrorCode;
  details?: {
    requested_count?: number;
    available_count?: number;
    template_id?: string;
    template_slug?: string;
    template_title?: string;
  };
};

export function isAssessmentStartErrorCode(value: string): value is AssessmentStartErrorCode {
  return (ASSESSMENT_START_ERROR_CODES as readonly string[]).includes(value);
}

export function parseAssessmentStartRequest(body: unknown):
  | { ok: true; value: AssessmentStartRequest }
  | { ok: false; code: "INVALID_PAYLOAD"; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "INVALID_PAYLOAD", error: "A JSON object with template_id is required." };
  }
  const record = body as Record<string, unknown>;
  const templateId = String(record.template_id ?? "").trim();
  if (!templateId) {
    return { ok: false, code: "INVALID_PAYLOAD", error: "template_id is required." };
  }
  if (!UUID_RE.test(templateId)) {
    return { ok: false, code: "INVALID_PAYLOAD", error: "template_id must be a valid UUID." };
  }
  const idempotencyKey =
    typeof record.idempotency_key === "string" ? record.idempotency_key.trim().slice(0, 150) : undefined;
  return {
    ok: true,
    value: {
      template_id: templateId,
      idempotency_key: idempotencyKey || undefined,
    },
  };
}

export function userMessageForAssessmentError(
  code: AssessmentStartErrorCode,
  details?: AssessmentStartErrorBody["details"],
): string {
  switch (code) {
    case "INVALID_PAYLOAD":
      return "This assessment could not be started because the request was invalid.";
    case "UNAUTHORIZED":
      return "Sign in to start this assessment.";
    case "ORIGIN_NOT_ALLOWED":
      return "This request was blocked by the server security policy.";
    case "ASSESSMENT_NOT_FOUND":
      return "That assessment template was not found.";
    case "ASSESSMENT_NOT_AVAILABLE":
      return "This assessment is not currently available.";
    case "ASSESSMENT_NOT_ELIGIBLE":
      return "You are not eligible to start this assessment.";
    case "INVALID_ASSESSMENT_TEMPLATE":
      return "This assessment template is invalid and cannot be started.";
    case "INSUFFICIENT_QUESTION_INVENTORY": {
      const requested = details?.requested_count;
      const available = details?.available_count;
      if (typeof requested === "number" && typeof available === "number") {
        return `This assessment needs ${requested} eligible questions, but only ${available} are available. It was not started.`;
      }
      return "There are not enough eligible questions to start this assessment.";
    }
    case "MAX_ATTEMPTS_REACHED":
      return "You have reached the maximum number of attempts for this assessment.";
    case "CAPABILITY_REQUIRED":
      return "Your current plan does not include this assessment.";
    case "ASSESSMENT_START_FAILED":
    default:
      return "The assessment could not be started. Please try again.";
  }
}

export function isRetryableAssessmentStartCode(code: string): boolean {
  return code === "ASSESSMENT_START_FAILED";
}

type RpcLikeError = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function parseHint(hint: string | null | undefined): AssessmentStartErrorBody["details"] | undefined {
  if (!hint) return undefined;
  try {
    const parsed = JSON.parse(hint) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as AssessmentStartErrorBody["details"];
  } catch {
    return undefined;
  }
}

export function mapAssessmentRpcError(error: RpcLikeError | null | undefined): {
  code: AssessmentStartErrorCode;
  error: string;
  details?: AssessmentStartErrorBody["details"];
} {
  const detailsCode = String(error?.details ?? "").trim();
  const message = String(error?.message ?? "");
  const hintDetails = parseHint(error?.hint);
  if (isAssessmentStartErrorCode(detailsCode)) {
    return {
      code: detailsCode,
      error: userMessageForAssessmentError(detailsCode, hintDetails),
      details: hintDetails,
    };
  }
  const lower = message.toLowerCase();
  if (lower.includes("not authenticated")) {
    return { code: "UNAUTHORIZED", error: userMessageForAssessmentError("UNAUTHORIZED") };
  }
  if (lower.includes("maximum attempts")) {
    return { code: "MAX_ATTEMPTS_REACHED", error: userMessageForAssessmentError("MAX_ATTEMPTS_REACHED") };
  }
  if (lower.includes("not enough") || lower.includes("insufficient")) {
    return {
      code: "INSUFFICIENT_QUESTION_INVENTORY",
      error: userMessageForAssessmentError("INSUFFICIENT_QUESTION_INVENTORY", hintDetails),
      details: hintDetails,
    };
  }
  if (lower.includes("template not found")) {
    return { code: "ASSESSMENT_NOT_FOUND", error: userMessageForAssessmentError("ASSESSMENT_NOT_FOUND") };
  }
  if (lower.includes("not available") || lower.includes("not published")) {
    return { code: "ASSESSMENT_NOT_AVAILABLE", error: userMessageForAssessmentError("ASSESSMENT_NOT_AVAILABLE") };
  }
  if (lower.includes("invalid") && lower.includes("template")) {
    return { code: "INVALID_ASSESSMENT_TEMPLATE", error: userMessageForAssessmentError("INVALID_ASSESSMENT_TEMPLATE") };
  }
  return { code: "ASSESSMENT_START_FAILED", error: userMessageForAssessmentError("ASSESSMENT_START_FAILED") };
}

export type AssembleAssessmentDecisionInput = {
  method: string;
  originAllowed: boolean;
  hasOrigin: boolean;
  hasJwt: boolean;
  jwtValid: boolean;
  capabilityAllowed: boolean;
  body: unknown;
  rpc?:
    | { ok: true; data: AssessmentStartSuccess }
    | { ok: false; error: RpcLikeError }
    | { ok: false; failure: true };
};

export type AssembleAssessmentDecision = {
  status: number;
  body: Record<string, unknown>;
  includeCors: boolean;
};

export function decideAssembleAssessmentResponse(
  input: AssembleAssessmentDecisionInput,
): AssembleAssessmentDecision {
  const method = input.method.toUpperCase();
  if (method === "OPTIONS") {
    if (input.hasOrigin && !input.originAllowed) {
      return {
        status: 403,
        body: { error: "Origin not allowed.", code: "ORIGIN_NOT_ALLOWED" },
        includeCors: false,
      };
    }
    return { status: 204, body: {}, includeCors: true };
  }

  if (input.hasOrigin && !input.originAllowed) {
    return {
      status: 403,
      body: {
        error: userMessageForAssessmentError("ORIGIN_NOT_ALLOWED"),
        code: "ORIGIN_NOT_ALLOWED",
      },
      includeCors: true,
    };
  }

  if (!input.hasJwt) {
    return {
      status: 401,
      body: { error: userMessageForAssessmentError("UNAUTHORIZED"), code: "UNAUTHORIZED" },
      includeCors: true,
    };
  }
  if (!input.jwtValid) {
    return {
      status: 401,
      body: { error: userMessageForAssessmentError("UNAUTHORIZED"), code: "UNAUTHORIZED" },
      includeCors: true,
    };
  }

  if (method !== "POST") {
    return {
      status: 405,
      body: { error: "Method not allowed.", code: "INVALID_PAYLOAD" },
      includeCors: true,
    };
  }

  const parsed = parseAssessmentStartRequest(input.body);
  if (parsed.ok === false) {
    return {
      status: ASSESSMENT_START_HTTP.INVALID_PAYLOAD,
      body: { error: parsed.error, code: parsed.code },
      includeCors: true,
    };
  }

  if (!input.capabilityAllowed) {
    return {
      status: ASSESSMENT_START_HTTP.CAPABILITY_REQUIRED,
      body: {
        error: userMessageForAssessmentError("CAPABILITY_REQUIRED"),
        code: "CAPABILITY_REQUIRED",
      },
      includeCors: true,
    };
  }

  if (!input.rpc) {
    return {
      status: 200,
      body: { template_id: parsed.value.template_id, validated: true },
      includeCors: true,
    };
  }

  if (input.rpc.ok) {
    return { status: 200, body: input.rpc.data, includeCors: true };
  }
  if ("failure" in input.rpc && input.rpc.failure) {
    return {
      status: ASSESSMENT_START_HTTP.ASSESSMENT_START_FAILED,
      body: {
        error: userMessageForAssessmentError("ASSESSMENT_START_FAILED"),
        code: "ASSESSMENT_START_FAILED",
      },
      includeCors: true,
    };
  }
  if (!("error" in input.rpc)) {
    return {
      status: ASSESSMENT_START_HTTP.ASSESSMENT_START_FAILED,
      body: {
        error: userMessageForAssessmentError("ASSESSMENT_START_FAILED"),
        code: "ASSESSMENT_START_FAILED",
      },
      includeCors: true,
    };
  }
  const mapped = mapAssessmentRpcError(input.rpc.error);
  return {
    status: ASSESSMENT_START_HTTP[mapped.code],
    body: {
      error: mapped.error,
      code: mapped.code,
      ...(mapped.details ? { details: mapped.details } : {}),
    },
    includeCors: true,
  };
}

export function assessmentStartIdempotencyKey(userId: string, templateId: string): string {
  const uid = userId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64) || "user";
  const tid = templateId.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64) || "template";
  return `assess-start:${uid}:${tid}`.slice(0, 150);
}

export function extractAssessmentInventoryDetails(
  payload: unknown,
): AssessmentStartErrorBody["details"] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const nested =
    record.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : record;
  const requested = Number(nested.requested_count ?? nested.required ?? nested.requested);
  const available = Number(nested.available_count ?? nested.available ?? nested.count);
  if (!Number.isFinite(requested) && !Number.isFinite(available)) return undefined;
  return {
    requested_count: Number.isFinite(requested) ? requested : undefined,
    available_count: Number.isFinite(available) ? available : undefined,
    template_id: typeof nested.template_id === "string" ? nested.template_id : undefined,
    template_slug: typeof nested.template_slug === "string" ? nested.template_slug : undefined,
    template_title: typeof nested.template_title === "string" ? nested.template_title : undefined,
  };
}

export function messageFromAssessmentStartError(err: unknown): {
  text: string;
  retryable: boolean;
} {
  if (err instanceof ApiClientError) {
    const code = isAssessmentStartErrorCode(err.code) ? err.code : "ASSESSMENT_START_FAILED";
    const details = extractAssessmentInventoryDetails(err.details);
    return {
      text: userMessageForAssessmentError(code as AssessmentStartErrorCode, details),
      retryable: isRetryableAssessmentStartCode(code),
    };
  }
  if (err && typeof err === "object" && "message" in err) {
    const code =
      "details" in err && typeof (err as { details?: string }).details === "string"
        ? (err as { details: string }).details
        : "";
    if (isAssessmentStartErrorCode(code)) {
      return {
        text: userMessageForAssessmentError(code),
        retryable: isRetryableAssessmentStartCode(code),
      };
    }
  }
  return {
    text: err instanceof Error ? err.message : userMessageForAssessmentError("ASSESSMENT_START_FAILED"),
    retryable: true,
  };
}
