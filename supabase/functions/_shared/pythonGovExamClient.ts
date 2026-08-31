/**
 * Edge → Python FastAPI HMAC client for government exam hybrid orchestration.
 * Never import from browser code — secrets stay on the Edge runtime only.
 *
 * Signing is delegated to pythonClient.signInternalRequest
 * (METHOD, path, timestamp, requestId, sha256(body) — same as FastAPI).
 */

import { signInternalRequest } from "./pythonClient.ts";

const DEFAULT_TIMEOUT_MS = 25_000;
/** Ack-only: Python claims (or worker already owns) and continues in background. */
const PROCESS_JOB_TIMEOUT_MS = 8_000;

export type PythonGovExamError = {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
  correlationId?: string;
};

export type PythonAvailabilityRequest = {
  exam_id: string;
  stage_id: string;
  paper_id?: string | null;
  language?: string;
  question_count: number;
  topics?: string[];
  difficulty?: string | null;
  correlation_id: string;
  job_id?: string | null;
  bank_type_keys?: string[];
  mode?: string;
};

export type PythonAvailabilityResult = {
  requested: number;
  eligible?: number;
  available: number;
  missing: number;
  can_full_mock: boolean;
  can_custom_practice: boolean;
  custom_practice_max: number;
  exam_type_keys?: string[];
  section_coverage?: Record<string, unknown>;
  language_available?: boolean;
  blocked_reason?: string | null;
  mode?: string;
};

export type PythonSelectRequest = {
  exam_id: string;
  stage_id: string;
  language?: string;
  question_count: number;
  topics?: string[];
  difficulty?: string | null;
  seed?: string;
  correlation_id: string;
  job_id?: string | null;
  exclude_ids?: string[];
};

export type PythonSelectResult = {
  question_ids: string[];
  selected_count: number;
  available?: number;
  seed?: string;
};

export type PythonProcessJobRequest = {
  job_id: string;
  correlation_id: string;
};

export type PythonProcessJobResult = {
  success?: boolean;
  job_id?: string;
  status?: string;
  paper_id?: string | null;
  mock_test_id?: string | null;
  accepted?: boolean;
};

export type PythonValidateQuestionPayload = {
  question_text: string;
  options: unknown[];
  correct_answer?: string | number | null;
  correct_index?: number | null;
  explanation?: string | null;
  subject?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  language?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  id?: string | null;
};

export type PythonValidateQuestionsRequest = {
  questions: PythonValidateQuestionPayload[];
  correlation_id: string;
  job_id?: string | null;
  language?: string;
  reject_near_duplicates?: boolean;
};

export type PythonValidateQuestionsResult = {
  accepted_count: number;
  rejected_count: number;
  rejected_indices: number[];
  rejected_reasons: Record<number, string[]>;
};

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

/**
 * Resolve FastAPI base URL (no trailing slash).
 *
 * Must include the same keys as `_shared/pythonClient.ts` (`PYTHON_SERVICE_URL` /
 * `SCRAPER_URL`) so hybrid-health "Python connected" also enables gov-exam dispatch.
 * Gov-specific aliases remain first for dedicated overrides.
 */
export function resolvePythonGovExamBaseUrl(): string | null {
  for (const key of [
    "GOV_EXAM_PYTHON_URL",
    "PAPER_FACTORY_URL",
    "SCRAPER_SERVICE_URL",
    // Align with pythonClient / hybrid-health / .env.example
    "PYTHON_SERVICE_URL",
    "SCRAPER_URL",
  ]) {
    const raw = env(key);
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      return `${u.origin}${u.pathname.replace(/\/$/, "")}`;
    } catch {
      // ignore malformed
    }
  }
  return null;
}

export function resolvePythonGovExamSecret(): string | null {
  // Same secret chain as pythonClient.getAuthSecret (HMAC shared with Render).
  const secret =
    env("DOCUMENT_INTELLIGENCE_AUTH_SECRET") ||
    env("PYTHON_SERVICE_AUTH_SECRET");
  return secret.length >= 16 ? secret : null;
}

/** True when Edge can HMAC-call Python (URL + secret present). */
export function isPythonGovExamConfigured(): boolean {
  return Boolean(resolvePythonGovExamBaseUrl() && resolvePythonGovExamSecret());
}

/**
 * Whether a durable gov paper job should be tagged `python_paper_factory`
 * so the Python poller (or HTTP process-job) owns it — not Edge assembler.
 *
 * Tag when the plan already chose Python, hybrid fill needs the factory,
 * the caller prefers Python and a worker is available, or bank-only work
 * should run on the configured Python path (PAPER_FACTORY_WORKER / HTTP).
 */
export function wantsPythonPaperFactoryGenerator(input: {
  planGenerator: string;
  planKind: string;
  generatorPreference?: string | null;
  pythonHttpConfigured: boolean;
  paperFactoryWorkerEnabled?: boolean;
}): boolean {
  const pref = String(input.generatorPreference ?? "").trim().toLowerCase();
  const preferPython =
    pref === "python" ||
    pref === "python_paper_factory" ||
    pref === "factory" ||
    pref === "py";
  const pythonAvailable =
    input.pythonHttpConfigured || input.paperFactoryWorkerEnabled === true;

  // Never tag python_paper_factory when no worker or HTTP can claim the job.
  if (!pythonAvailable || pref === "edge") return false;
  if (input.planKind === "bank_only") return false;
  if (input.planGenerator === "python_paper_factory") return true;
  if (input.planKind === "hybrid_deterministic") return true;
  if (preferPython) return true;
  return false;
}

function newRequestId(): string {
  return `edge-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function logDispatch(operation: string, correlationId: string, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      tag: "[GOV_EXAM] edge_dispatch",
      operation,
      correlation_id: correlationId,
      ...extra,
    }),
  );
}

async function signedFetch(
  method: "GET" | "POST",
  path: string,
  bodyObj: Record<string, unknown> | null,
  opts: { timeoutMs: number; correlationId: string; operation: string },
): Promise<{ ok: true; status: number; json: Record<string, unknown> } | { ok: false; error: PythonGovExamError }> {
  const base = resolvePythonGovExamBaseUrl();
  const secret = resolvePythonGovExamSecret();
  if (!base || !secret) {
    return {
      ok: false,
      error: {
        code: "PYTHON_NOT_CONFIGURED",
        message: "Python gov-exam service is not configured.",
        retryable: false,
        correlationId: opts.correlationId,
      },
    };
  }

  const bodyText = bodyObj == null ? "" : JSON.stringify(bodyObj);
  const bodyBytes = new TextEncoder().encode(bodyText);
  const requestId = newRequestId();
  let authHeaders: Record<string, string>;
  try {
    authHeaders = await signInternalRequest(method, path, bodyBytes, requestId);
  } catch {
    return {
      ok: false,
      error: {
        code: "PYTHON_NOT_CONFIGURED",
        message: "Python internal auth secret is not configured.",
        retryable: false,
        correlationId: opts.correlationId,
      },
    };
  }

  logDispatch(opts.operation, opts.correlationId, {
    path,
    request_id: requestId,
    job_id: bodyObj?.job_id ?? null,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: method === "GET" ? undefined : bodyText,
      signal: controller.signal,
    });

    let json: Record<string, unknown> = {};
    const text = await res.text();
    if (text.trim()) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = { raw: text.slice(0, 200) };
      }
    }

    if (!res.ok) {
      const detail = (json.error ?? json.detail ?? json) as Record<string, unknown>;
      const code = String(
        (detail as { code?: unknown })?.code ??
          (typeof detail === "object" && detail && "code" in detail
            ? (detail as { code: unknown }).code
            : null) ??
          "PYTHON_HTTP_ERROR",
      );
      const message = String(
        (detail as { message?: unknown })?.message ??
          json.message ??
          `Python gov-exam call failed (${res.status})`,
      );
      return {
        ok: false,
        error: {
          code,
          message: message.slice(0, 400),
          retryable: res.status >= 500 || res.status === 429,
          status: res.status,
          correlationId: opts.correlationId,
        },
      };
    }

    return { ok: true, status: res.status, json };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "PYTHON_TIMEOUT" : "PYTHON_NETWORK_ERROR",
        message: aborted
          ? "Python gov-exam service timed out."
          : err instanceof Error
          ? err.message.slice(0, 240)
          : "Python gov-exam network error.",
        retryable: true,
        correlationId: opts.correlationId,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function asInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export async function pythonGovAvailability(
  input: PythonAvailabilityRequest,
): Promise<{ ok: true; data: PythonAvailabilityResult } | { ok: false; error: PythonGovExamError }> {
  const correlationId = input.correlation_id || crypto.randomUUID();
  const result = await signedFetch(
    "POST",
    "/internal/gov-exams/availability",
    {
      exam_id: input.exam_id,
      stage_id: input.stage_id,
      paper_id: input.paper_id ?? null,
      language: input.language ?? "en",
      question_count: input.question_count,
      topics: input.topics ?? [],
      difficulty: input.difficulty ?? null,
      correlation_id: correlationId,
      job_id: input.job_id ?? null,
      bank_type_keys: input.bank_type_keys ?? [],
      mode: input.mode ?? "generated_mock",
    },
    {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      correlationId,
      operation: "availability",
    },
  );

  if (!result.ok) return result;

  const j = result.json;
  const requested = asInt(j.requested, input.question_count);
  const available = asInt(j.available, 0);
  const missing = asInt(j.missing, Math.max(0, requested - available));
  const customMax = asInt(j.custom_practice_max ?? j.customPracticeMax, available);

  return {
    ok: true,
    data: {
      requested,
      available,
      missing,
      can_full_mock: Boolean(j.can_full_mock ?? j.canFullMock ?? available >= requested),
      can_custom_practice: Boolean(
        j.can_custom_practice ?? j.canCustomPractice ?? available >= 5,
      ),
      custom_practice_max: Math.max(0, customMax),
      exam_type_keys: Array.isArray(j.exam_type_keys)
        ? (j.exam_type_keys as string[])
        : Array.isArray(j.examTypeKeys)
        ? (j.examTypeKeys as string[])
        : [],
      section_coverage:
        j.section_coverage && typeof j.section_coverage === "object"
          ? (j.section_coverage as Record<string, unknown>)
          : {},
    },
  };
}

export async function pythonGovSelect(
  input: PythonSelectRequest,
): Promise<{ ok: true; data: PythonSelectResult } | { ok: false; error: PythonGovExamError }> {
  const correlationId = input.correlation_id || crypto.randomUUID();
  const result = await signedFetch(
    "POST",
    "/internal/gov-exams/select",
    {
      exam_id: input.exam_id,
      stage_id: input.stage_id,
      language: input.language ?? "en",
      question_count: input.question_count,
      topics: input.topics ?? [],
      difficulty: input.difficulty ?? null,
      seed: input.seed ?? null,
      correlation_id: correlationId,
      job_id: input.job_id ?? null,
      exclude_ids: input.exclude_ids ?? [],
    },
    {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      correlationId,
      operation: "select",
    },
  );

  if (!result.ok) return result;

  const j = result.json;
  const idsRaw = j.question_ids ?? j.questionIds ?? j.selected_ids ?? [];
  const questionIds = Array.isArray(idsRaw)
    ? idsRaw.map((id) => String(id)).filter(Boolean)
    : [];

  return {
    ok: true,
    data: {
      question_ids: questionIds,
      selected_count: asInt(j.selected_count ?? j.selectedCount, questionIds.length),
      available: j.available != null ? asInt(j.available) : undefined,
      seed: j.seed != null ? String(j.seed) : undefined,
    },
  };
}

/**
 * Fire-and-forget: short timeout so Edge can return 202 quickly.
 * PYTHON_TIMEOUT / JOB_NOT_CLAIMABLE mean Python (or the worker) still owns the job.
 */
export function pythonDispatchKeepsPythonOwner(error: PythonGovExamError): boolean {
  if (error.code === "PYTHON_NOT_CONFIGURED" || error.code === "PYTHON_NETWORK_ERROR") {
    return false;
  }
  if (error.code === "PYTHON_TIMEOUT" || error.code === "JOB_NOT_CLAIMABLE") {
    return true;
  }
  return Boolean(error.retryable);
}

export async function pythonGovProcessJob(
  input: PythonProcessJobRequest,
): Promise<{ ok: true; data: PythonProcessJobResult } | { ok: false; error: PythonGovExamError }> {
  const correlationId = input.correlation_id || crypto.randomUUID();
  const result = await signedFetch(
    "POST",
    "/internal/gov-exams/process-job",
    {
      job_id: input.job_id,
      correlation_id: correlationId,
    },
    {
      timeoutMs: PROCESS_JOB_TIMEOUT_MS,
      correlationId,
      operation: "process-job",
    },
  );

  if (!result.ok) {
    if (pythonDispatchKeepsPythonOwner(result.error)) {
      return {
        ok: true,
        data: {
          success: true,
          job_id: input.job_id,
          status: "queued",
          accepted: true,
        },
      };
    }
    return result;
  }

  return {
    ok: true,
    data: {
      success: result.json.success !== false,
      job_id: String(result.json.job_id ?? input.job_id),
      status: result.json.status != null ? String(result.json.status) : "queued",
      paper_id: (result.json.paper_id as string | null | undefined) ?? null,
      mock_test_id: (result.json.mock_test_id as string | null | undefined) ?? null,
      accepted: result.json.accepted !== false,
    },
  };
}

/** Canonical Python validation gate — rejects invalid MCQs before publication. */
export async function pythonGovValidateQuestions(
  input: PythonValidateQuestionsRequest,
): Promise<{ ok: true; data: PythonValidateQuestionsResult } | { ok: false; error: PythonGovExamError }> {
  const correlationId = input.correlation_id || crypto.randomUUID();
  const result = await signedFetch(
    "POST",
    "/internal/gov-exams/validate-questions",
    {
      questions: input.questions,
      correlation_id: correlationId,
      job_id: input.job_id ?? null,
      language: input.language ?? "en",
      reject_near_duplicates: input.reject_near_duplicates !== false,
    },
    {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      correlationId,
      operation: "validate-questions",
    },
  );

  if (!result.ok) return result;

  const j = result.json;
  const rejectedRaw = (j.rejected ?? []) as Array<{
    index?: number;
    reasons?: string[];
  }>;
  const rejectedIndices: number[] = [];
  const rejectedReasons: Record<number, string[]> = {};
  for (const row of rejectedRaw) {
    const index = Number(row.index);
    if (!Number.isFinite(index)) continue;
    rejectedIndices.push(index);
    rejectedReasons[index] = Array.isArray(row.reasons)
      ? row.reasons.map((r) => String(r))
      : ["rejected"];
  }

  return {
    ok: true,
    data: {
      accepted_count: asInt(j.accepted_count, input.questions.length - rejectedIndices.length),
      rejected_count: asInt(j.rejected_count, rejectedIndices.length),
      rejected_indices: rejectedIndices,
      rejected_reasons: rejectedReasons,
    },
  };
}
