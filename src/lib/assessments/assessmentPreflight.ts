/**
 * Authoritative assessment launch preflight (client).
 * Fail-closed: unknown availability is never treated as startable.
 */

import {
  checkAssessmentAvailability,
  type AssessmentAvailabilityItem,
} from "@/lib/gov-exam/api";
import { ApiClientError } from "@/lib/api/apiClient";
import {
  userMessageForAssessmentError,
  type AssessmentStartErrorCode,
  isAssessmentStartErrorCode,
} from "@/lib/assessments/assessmentStart";

export const RETRYABLE_AVAILABILITY_CODES = new Set([
  "PROVIDER_UNAVAILABLE",
  "DATABASE_FAILURE",
  "ASSESSMENT_START_FAILED",
]);

export const AVAILABILITY_RETRY_MESSAGE =
  "Availability check is temporarily unavailable. Please retry in a moment.";

function isRetryableAvailabilityCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return RETRYABLE_AVAILABILITY_CODES.has(code);
}

function messageFromAvailabilityFailure(
  code: string | null | undefined,
  fallback?: string,
): string {
  if (code === "PROVIDER_UNAVAILABLE" || code === "DATABASE_FAILURE") {
    return AVAILABILITY_RETRY_MESSAGE;
  }
  return fallback ?? AVAILABILITY_RETRY_MESSAGE;
}

export type AssessmentPreflightStatus = "ok" | "blocked" | "unknown";

export type AssessmentPreflightItem = {
  templateId: string;
  status: AssessmentPreflightStatus;
  startable: boolean;
  retryable: boolean;
  code: string | null;
  available: number | null;
  requested: number | null;
  attemptsUsed: number | null;
  maxAttempts: number | null;
  resumableTestId: string | null;
  message: string | null;
  raw: AssessmentAvailabilityItem | null;
};

export type AssessmentPreflightResult = {
  ok: boolean;
  byTemplateId: Record<string, AssessmentPreflightItem>;
  errorMessage: string | null;
};

function codeMessage(
  code: string | null | undefined,
  item: AssessmentAvailabilityItem | null,
  fallbackRequested?: number,
): string | null {
  if (!code) return null;
  if (isAssessmentStartErrorCode(code)) {
    return userMessageForAssessmentError(code as AssessmentStartErrorCode, {
      requested_count: item?.requested_count ?? item?.requested ?? fallbackRequested,
      available_count: item?.available_count ?? item?.available,
      template_id: item?.template_id,
      template_slug: item?.template_slug,
      template_title: item?.template_title,
    });
  }
  return "This assessment cannot be started right now.";
}

export function mapAvailabilityItem(
  templateId: string,
  item: AssessmentAvailabilityItem | null | undefined,
  opts?: { requestedFallback?: number },
): AssessmentPreflightItem {
  if (!item) {
    return {
      templateId,
      status: "unknown",
      startable: false,
      retryable: true,
      code: "ASSESSMENT_START_FAILED",
      available: null,
      requested: opts?.requestedFallback ?? null,
      attemptsUsed: null,
      maxAttempts: null,
      resumableTestId: null,
      message: "Could not verify question inventory. Retry before starting.",
      raw: null,
    };
  }

  const available = item.available_count ?? item.available ?? null;
  const requested =
    item.requested_count ?? item.requested ?? opts?.requestedFallback ?? null;
  const startable = item.startable === true;
  const code = item.code ?? null;
  const itemRetryable =
    typeof (item as { retryable?: boolean }).retryable === "boolean"
      ? Boolean((item as { retryable?: boolean }).retryable)
      : isRetryableAvailabilityCode(code);

  if (startable) {
    return {
      templateId,
      status: "ok",
      startable: true,
      retryable: false,
      code,
      available,
      requested,
      attemptsUsed: item.attempts_used ?? null,
      maxAttempts: item.max_attempts ?? null,
      resumableTestId: item.resumable_test_id ?? null,
      message: item.resumable_test_id
        ? "Continue your in-progress attempt."
        : null,
      raw: item,
    };
  }

  const inventoryShort =
    code === "INSUFFICIENT_QUESTION_INVENTORY" ||
    (typeof available === "number" &&
      typeof requested === "number" &&
      available < requested);

  return {
    templateId,
    status: "blocked",
    startable: false,
    retryable: itemRetryable,
    code: inventoryShort && !code ? "INSUFFICIENT_QUESTION_INVENTORY" : code,
    available,
    requested,
    attemptsUsed: item.attempts_used ?? null,
    maxAttempts: item.max_attempts ?? null,
    resumableTestId: item.resumable_test_id ?? null,
    message:
      codeMessage(
        inventoryShort && !code ? "INSUFFICIENT_QUESTION_INVENTORY" : code,
        item,
        opts?.requestedFallback,
      ) ??
      (itemRetryable
        ? messageFromAvailabilityFailure(code)
        : "This assessment cannot be started right now."),
    raw: item,
  };
}

/**
 * Prefetch availability for one or more templates.
 * On network/RPC failure every requested id is marked unknown (not startable).
 */
export async function preflightAssessmentTemplates(
  templateIds: string[],
  opts?: { requestedByTemplateId?: Record<string, number> },
): Promise<AssessmentPreflightResult> {
  const ids = [...new Set(templateIds.filter(Boolean))];
  const byTemplateId: Record<string, AssessmentPreflightItem> = {};

  if (ids.length === 0) {
    return { ok: true, byTemplateId, errorMessage: null };
  }

  try {
    const items = await checkAssessmentAvailability(ids);
    const found = new Map<string, AssessmentAvailabilityItem>();
    for (const item of items) {
      if (item.template_id) found.set(item.template_id, item);
    }
    for (const id of ids) {
      byTemplateId[id] = mapAvailabilityItem(id, found.get(id), {
        requestedFallback: opts?.requestedByTemplateId?.[id],
      });
    }
    return { ok: true, byTemplateId, errorMessage: null };
  } catch (err) {
    const apiErr = err instanceof ApiClientError ? err : null;
    const code =
      typeof apiErr?.code === "string" && apiErr.code.trim()
        ? apiErr.code
        : "ASSESSMENT_START_FAILED";
    const retryable =
      apiErr?.status === 503 || isRetryableAvailabilityCode(code);
    const message =
      retryable
        ? messageFromAvailabilityFailure(code, AVAILABILITY_RETRY_MESSAGE)
        : err instanceof Error && err.message.trim()
          ? err.message
          : "Could not verify question inventory. Retry before starting.";
    for (const id of ids) {
      byTemplateId[id] = {
        templateId: id,
        status: "unknown",
        startable: false,
        retryable,
        code,
        available: null,
        requested: opts?.requestedByTemplateId?.[id] ?? null,
        attemptsUsed: null,
        maxAttempts: null,
        resumableTestId: null,
        message,
        raw: null,
      };
    }
    return { ok: false, byTemplateId, errorMessage: message };
  }
}

export async function preflightSingleAssessmentTemplate(
  templateId: string,
  requestedFallback?: number,
): Promise<AssessmentPreflightItem> {
  const result = await preflightAssessmentTemplates([templateId], {
    requestedByTemplateId:
      typeof requestedFallback === "number"
        ? { [templateId]: requestedFallback }
        : undefined,
  });
  return (
    result.byTemplateId[templateId] ??
    mapAvailabilityItem(templateId, null, { requestedFallback })
  );
}
