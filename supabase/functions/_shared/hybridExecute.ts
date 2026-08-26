/**
 * Core hybrid execution engine for Edge feature functions.
 *
 * Flow:
 * 1. Resolve correlation_id / operation_id
 * 2. Idempotency lookup (getIdempotentResponse) when key provided
 * 3. decideRoute via operationRouter
 * 4. Reserve credits ONCE via deductCreditsAtomic (if cost > 0)
 * 5. Try preferredOrder; skip AI/python when force flags / not configured
 * 6. On AI failure → python when pythonFallbackOnAiFailure (no re-deduct)
 * 7. On Python failure → AI when aiFallbackOnPythonFailure; else deterministic/database
 * 8. validate → storeIdempotentResponse → recordOperationSource → hybridSuccess
 * 9. On total failure → refund reserved credits → hybridFailure
 * 10. Never fake success
 *
 * Env notes:
 * - PYTHON_SERVICE_URL + DOCUMENT_INTELLIGENCE_AUTH_SECRET for Python path
 * - HYBRID_FORCE_PYTHON_UNAVAILABLE=1 / HYBRID_FORCE_AI_UNAVAILABLE=1 for chaos tests
 */

import { resolveCorrelationId } from "./cors.ts";
import {
  classifyAiFailure,
  classifyPythonFailure,
  DomainError,
  type DomainErrorCode,
} from "./domainErrors.ts";
import {
  classifyCreditFailure,
  creditDenialResponse,
} from "./creditAuthority.ts";
import {
  hybridFailure,
  hybridSuccess,
  type HybridMeta,
  type OperationSource,
} from "./hybridResponse.ts";
import {
  decideRoute,
  type HybridOperation,
  type HybridRouteSource,
  type RouteDecision,
} from "./operationRouter.ts";
import { recordOperationSource } from "./operationSource.ts";
import {
  isPythonConfigured,
  isPythonForceUnavailable,
  pythonExecuteOperation,
} from "./pythonClient.ts";
import {
  createServiceClient,
  deductCreditsAtomic,
  getIdempotentResponse,
  refundCredits,
  storeIdempotentResponse,
  type DeductCreditsAtomicResult,
} from "./supabase.ts";
import type { AuthContext as UtilsAuthContext } from "./types.ts";

export type { OperationSource };

export type HybridAuth =
  | UtilsAuthContext
  | { userId: string; planId?: string; credits?: number; isAdmin?: boolean; email?: string };

export type PythonRunContext = {
  correlationId: string;
  operationId: string;
  operation: string;
  body: Record<string, unknown>;
  route: RouteDecision;
};

export type HybridExecuteInput<T = unknown> = {
  req: Request;
  auth: HybridAuth;
  operation: HybridOperation | string;
  idempotencyKey?: string | null;
  /** Credits to reserve once before processing. 0 / omit = no deduction. */
  creditCost?: number;
  /** Credit action / cost key (defaults to operation name). */
  creditAction?: string;
  body?: Record<string, unknown>;
  runDatabase?: () => Promise<T | null>;
  runDeterministic?: () => Promise<T | null>;
  runPython?: (ctx: PythonRunContext) => Promise<T | null>;
  runAi?: () => Promise<T>;
  validate?: (data: T, source: OperationSource) => T | Promise<T>;
  /** Optional provider / model labels for logging (never secrets). */
  aiMeta?: { provider?: string; modelVersion?: string };
};

export type HybridResult<T = unknown> =
  | {
      ok: true;
      response: Response;
      data: T;
      source: OperationSource;
      operationId: string;
      correlationId: string;
      executionMs: number;
    }
  | {
      ok: false;
      response: Response;
      code: DomainErrorCode | string;
      correlationId: string;
      executionMs: number;
    };

function userIdOf(auth: HybridAuth): string {
  return (auth as UtilsAuthContext).userId;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function operationIdemKey(
  operation: string,
  userId: string,
  key: string,
): string {
  // Keep within idempotency key length limits (16–150).
  const raw = `hyb:${operation}:${userId.slice(0, 8)}:${key}`.slice(0, 150);
  return raw.length >= 16 ? raw : `${raw}_${"x".repeat(16 - raw.length)}`;
}

function asOperationSource(source: HybridRouteSource, fallbackUsed: boolean): OperationSource {
  if (fallbackUsed && (source === "python" || source === "ai" || source === "deterministic")) {
    return "fallback";
  }
  if (source === "deterministic") return "deterministic";
  if (source === "database") return "database";
  if (source === "python") return "python";
  return "ai";
}

type AttemptOutcome<T> =
  | { kind: "data"; data: T; routeSource: HybridRouteSource }
  | { kind: "skip" }
  | { kind: "fail"; code: DomainErrorCode; error: unknown };

async function runSource<T>(
  source: HybridRouteSource,
  input: HybridExecuteInput<T>,
  route: RouteDecision,
  ctx: PythonRunContext,
  flags: { skipAi: boolean; skipPython: boolean },
): Promise<AttemptOutcome<T>> {
  if (source === "database") {
    if (!input.runDatabase || !route.canCompleteWithDatabase) return { kind: "skip" };
    try {
      const data = await input.runDatabase();
      if (data == null) return { kind: "skip" };
      return { kind: "data", data, routeSource: "database" };
    } catch (err) {
      return { kind: "fail", code: "DATABASE_FAILURE", error: err };
    }
  }

  if (source === "deterministic") {
    if (!input.runDeterministic || !route.canCompleteDeterministically) {
      return { kind: "skip" };
    }
    try {
      const data = await input.runDeterministic();
      if (data == null) return { kind: "skip" };
      return { kind: "data", data, routeSource: "deterministic" };
    } catch (err) {
      return { kind: "fail", code: "DATABASE_FAILURE", error: err };
    }
  }

  if (source === "python") {
    if (flags.skipPython || !route.canUsePython) return { kind: "skip" };
    try {
      let data: T | null = null;
      if (input.runPython) {
        data = await input.runPython(ctx);
      } else {
        const py = await pythonExecuteOperation({
          operation: String(input.operation),
          operation_id: ctx.operationId,
          correlation_id: ctx.correlationId,
          user_id: userIdOf(input.auth),
          input: input.body ?? {},
        }, { requestId: ctx.correlationId });

        if (!py.ok) {
          return {
            kind: "fail",
            code: py.errorCode ?? classifyPythonFailure(undefined, py.status),
            error: new DomainError(
              py.errorCode ?? "PYTHON_SERVICE_UNAVAILABLE",
              py.errorMessage,
            ),
          };
        }
        const payload = py.json as { data?: T } | T | null;
        if (
          payload &&
          typeof payload === "object" &&
          "data" in (payload as Record<string, unknown>)
        ) {
          data = (payload as { data: T }).data ?? null;
        } else {
          data = payload as T | null;
        }
      }
      if (data == null) return { kind: "skip" };
      return { kind: "data", data, routeSource: "python" };
    } catch (err) {
      return {
        kind: "fail",
        code: classifyPythonFailure(err),
        error: err,
      };
    }
  }

  // AI
  if (flags.skipAi || !route.canUseAI || !input.runAi) return { kind: "skip" };
  try {
    const data = await input.runAi();
    if (data == null) {
      return {
        kind: "fail",
        code: "AI_INVALID_OUTPUT",
        error: new DomainError("AI_INVALID_OUTPUT", "AI returned empty output."),
      };
    }
    return { kind: "data", data, routeSource: "ai" };
  } catch (err) {
    return { kind: "fail", code: classifyAiFailure(err), error: err };
  }
}

function buildTriedOrder(route: RouteDecision): HybridRouteSource[] {
  const seen = new Set<HybridRouteSource>();
  const order: HybridRouteSource[] = [];
  for (const s of route.preferredOrder) {
    if (!seen.has(s)) {
      seen.add(s);
      order.push(s);
    }
  }
  return order;
}

/**
 * Append fallback sources after a primary failure without reordering the matrix
 * beyond the documented fallback rules.
 */
function enqueueFallbacks(
  failed: HybridRouteSource,
  route: RouteDecision,
  remaining: HybridRouteSource[],
  queued: Set<HybridRouteSource>,
): void {
  const push = (s: HybridRouteSource) => {
    if (!queued.has(s)) {
      remaining.push(s);
      queued.add(s);
    }
  };

  if (failed === "ai" && route.pythonFallbackOnAiFailure) {
    push("python");
    if (route.canCompleteDeterministically) push("deterministic");
    if (route.canCompleteWithDatabase) push("database");
  }

  if (failed === "python") {
    if (route.aiFallbackOnPythonFailure) push("ai");
    if (route.canCompleteDeterministically) push("deterministic");
    if (route.canCompleteWithDatabase) push("database");
  }
}

export async function executeHybridOperation<T = unknown>(
  input: HybridExecuteInput<T>,
): Promise<HybridResult<T>> {
  const started = Date.now();
  const correlationId = resolveCorrelationId(input.req);
  const operationId = newId();
  const userId = userIdOf(input.auth);
  const operation = String(input.operation);
  const body = input.body ?? {};
  const creditCost =
    typeof input.creditCost === "number" && Number.isFinite(input.creditCost)
      ? Math.max(0, Math.floor(input.creditCost))
      : 0;

  const route = decideRoute({ operation });
  const db = createServiceClient();

  // --- Idempotency replay ---
  const rawKey = input.idempotencyKey?.trim() || null;
  const opKey = rawKey ? operationIdemKey(operation, userId, rawKey) : null;

  if (opKey) {
    const prior = await getIdempotentResponse(db, opKey, {
      userId,
      action: `hybrid:${operation}`,
    });
    if (prior?.success && prior.payload) {
      const cached = prior.payload as {
        data?: T;
        source?: OperationSource;
        operation_id?: string;
        meta?: HybridMeta;
      };
      if (cached.data !== undefined && cached.source) {
        const executionMs = Date.now() - started;
        return {
          ok: true,
          data: cached.data,
          source: cached.source,
          operationId: cached.operation_id ?? operationId,
          correlationId,
          executionMs,
          response: hybridSuccess({
            req: input.req,
            data: cached.data,
            source: cached.source,
            operationId: cached.operation_id ?? operationId,
            correlationId,
            meta: {
              ...(cached.meta ?? {}),
              execution_ms: executionMs,
              idempotent_replay: true,
            },
          }),
        };
      }
    }
  }

  // Resolve durable database results before reserving credits. This closes the
  // race where two cache misses both reach the credit path, then one observes
  // the row persisted by the other request.
  if (input.runDatabase && route.canCompleteWithDatabase) {
    try {
      const cached = await input.runDatabase();
      if (cached != null) {
        const data = input.validate ? await input.validate(cached, "database") : cached;
        const executionMs = Date.now() - started;
        const stored: DeductCreditsAtomicResult = {
          success: true,
          payload: {
            data,
            source: "database",
            operation_id: operationId,
            meta: { execution_ms: executionMs },
          } as Record<string, unknown>,
        };
        await storeIdempotentResponse(db, opKey, stored, {
          userId,
          action: `hybrid:${operation}`,
        });
        return {
          ok: true,
          data,
          source: "database",
          operationId,
          correlationId,
          executionMs,
          response: hybridSuccess({
            req: input.req,
            data,
            source: "database",
            operationId,
            correlationId,
            meta: { execution_ms: executionMs, cached: true },
          }),
        };
      }
    } catch (error) {
      console.warn("[hybrid] database preflight failed; continuing", error);
    }
  }

  // --- Credit reserve (once) ---
  let creditsReserved = false;
  let creditFinalized = false;
  const creditAction = input.creditAction ?? route.creditCostKey ?? operation;

  if (creditCost > 0) {
    // Unique per attempt so a refunded reservation cannot stick as a free replay.
    // Successful operation replay is handled above via opKey before we reach here.
    const credit = await deductCreditsAtomic({
      userId,
      action: creditAction,
      cost: creditCost,
      // Reuse the caller's durable key so concurrent/retried requests cannot
      // reserve credits independently of the operation idempotency record.
      idempotencyKey: `hyb-crd:${opKey ?? operationId}`.slice(0, 150),
    });

    if (!credit.success) {
      // Preserve RPC classification — never collapse Forbidden/service errors into
      // INSUFFICIENT_CREDITS (that hid the service-role JWT detection bug).
      const creditCode = classifyCreditFailure(credit.error, credit.code);
      const code: DomainErrorCode =
        creditCode === "CAPABILITY_REQUIRED"
          ? "CAPABILITY_REQUIRED"
          : creditCode === "INSUFFICIENT_CREDITS" || creditCode === "PAYMENT_REQUIRED"
          ? "INSUFFICIENT_CREDITS"
          : "DATABASE_FAILURE";
      const executionMs = Date.now() - started;
      await recordOperationSource({
        operationId,
        userId,
        operationType: operation,
        source: "fallback",
        status: "failure",
        correlationId,
        executionMs,
        fallbackReason: creditCode,
      });
      return {
        ok: false,
        code,
        correlationId,
        executionMs,
        response: creditDenialResponse(input.req, credit, creditCost),
      };
    }
    creditsReserved = true;
  }

  const skipAi = !route.canUseAI;
  const skipPython =
    !route.canUsePython || isPythonForceUnavailable() || !isPythonConfigured();

  const ctx: PythonRunContext = {
    correlationId,
    operationId,
    operation,
    body,
    route,
  };

  const queue = buildTriedOrder(route);
  const queued = new Set<HybridRouteSource>(queue);
  let fallbackReason: string | undefined;
  let lastFailCode: DomainErrorCode = "PYTHON_SERVICE_UNAVAILABLE";
  let attempts = 0;
  const maxAttempts = 8;

  try {
    while (queue.length > 0 && attempts < maxAttempts) {
      attempts += 1;
      const source = queue.shift()!;
      const outcome = await runSource(source, input, route, ctx, {
        skipAi,
        skipPython,
      });

      if (outcome.kind === "skip") continue;

      if (outcome.kind === "fail") {
        lastFailCode = outcome.code;
        console.warn(
          JSON.stringify({
            phase: "HYBRID_SOURCE_FAIL",
            correlationId,
            operationId,
            operation,
            source,
            code: outcome.code,
          }),
        );
        const before = queue.length;
        enqueueFallbacks(source, route, queue, queued);
        if (queue.length > before) {
          fallbackReason = `${source}_failed:${outcome.code}`;
        }
        continue;
      }

      // Success path for this source
      let data = outcome.data;
      let opSource = asOperationSource(outcome.routeSource, Boolean(fallbackReason));

      if (input.validate) {
        try {
          data = await input.validate(data, opSource);
        } catch (err) {
          lastFailCode =
            outcome.routeSource === "ai"
              ? classifyAiFailure(err)
              : outcome.routeSource === "python"
              ? classifyPythonFailure(err)
              : "AI_INVALID_OUTPUT";
          fallbackReason = `validate_failed:${lastFailCode}`;
          enqueueFallbacks(outcome.routeSource, route, queue, queued);
          continue;
        }
      }

      // Prefer reporting the real producing source unless we explicitly fell back.
      if (!fallbackReason) {
        opSource = asOperationSource(outcome.routeSource, false);
      }

      const executionMs = Date.now() - started;
      const meta: HybridMeta = {
        execution_ms: executionMs,
        ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
        ...(input.aiMeta?.provider && outcome.routeSource === "ai"
          ? { provider: input.aiMeta.provider }
          : {}),
        ...(input.aiMeta?.modelVersion && outcome.routeSource === "ai"
          ? { model_version: input.aiMeta.modelVersion }
          : {}),
      };

      creditFinalized = true;

      const stored: DeductCreditsAtomicResult = {
        success: true,
        payload: {
          data,
          source: opSource,
          operation_id: operationId,
          meta,
        } as Record<string, unknown>,
      };
      await storeIdempotentResponse(db, opKey, stored, {
        userId,
        action: `hybrid:${operation}`,
      });

      await recordOperationSource({
        operationId,
        userId,
        operationType: operation,
        source: opSource,
        provider: meta.provider ?? null,
        modelVersion: typeof meta.model_version === "string" ? meta.model_version : null,
        fallbackReason: fallbackReason ?? null,
        executionMs,
        status: "success",
        correlationId,
      });

      return {
        ok: true,
        data,
        source: opSource,
        operationId,
        correlationId,
        executionMs,
        response: hybridSuccess({
          req: input.req,
          data,
          source: opSource,
          operationId,
          correlationId,
          meta,
        }),
      };
    }

    // Total failure
    const executionMs = Date.now() - started;
    if (creditsReserved && !creditFinalized) {
      await refundCredits({
        userId,
        cost: creditCost,
        reason: `hybrid_failure:${operation}:${lastFailCode}`,
        idempotencyKey: `hyb-ref:${operationId}`.slice(0, 150),
      });
    }

    await recordOperationSource({
      operationId,
      userId,
      operationType: operation,
      source: "fallback",
      fallbackReason: fallbackReason ?? lastFailCode,
      executionMs,
      status: "failure",
      correlationId,
    });

    return {
      ok: false,
      code: lastFailCode,
      correlationId,
      executionMs,
      response: hybridFailure({
        req: input.req,
        code: lastFailCode,
        correlationId,
      }),
    };
  } catch (err) {
    const executionMs = Date.now() - started;
    const code: DomainErrorCode =
      err instanceof DomainError
        ? err.code
        : /python|econnrefused|fetch failed/i.test(
            err instanceof Error ? err.message : String(err),
          )
        ? classifyPythonFailure(err)
        : "DATABASE_FAILURE";

    if (creditsReserved && !creditFinalized) {
      await refundCredits({
        userId,
        cost: creditCost,
        reason: `hybrid_exception:${operation}`,
        idempotencyKey: `hyb-ref:${operationId}`.slice(0, 150),
      }).catch(() => {});
    }

    await recordOperationSource({
      operationId,
      userId,
      operationType: operation,
      source: "fallback",
      fallbackReason: code,
      executionMs,
      status: "failure",
      correlationId,
    });

    return {
      ok: false,
      code,
      correlationId,
      executionMs,
      response: hybridFailure({
        req: input.req,
        code,
        correlationId,
      }),
    };
  }
}
