/**
 * Production verification: authenticated Edge → Python ping via HMAC.
 */

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, errorResponse, log } from "../_shared/utils.ts";
import { resolveCorrelationId } from "../_shared/cors.ts";
import { hybridSuccess, hybridFailure } from "../_shared/hybridResponse.ts";
import {
  isPythonConfigured,
  pythonExecuteOperation,
} from "../_shared/pythonClient.ts";

const FN = "hybrid-ping";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
  }

  try {
    const auth = await requireAuth(req);
    const correlationId = resolveCorrelationId(req);
    const operationId = crypto.randomUUID();

    if (!isPythonConfigured()) {
      return hybridFailure({
        req,
        code: "PYTHON_SERVICE_UNAVAILABLE",
        message: "Python service is not configured.",
        correlationId,
      });
    }

    const py = await pythonExecuteOperation(
      {
        operation: "ping",
        operation_id: operationId,
        correlation_id: correlationId,
        user_id: auth.userId,
        input: {},
      },
      { requestId: correlationId },
    );

    if (!py.ok) {
      log(FN, "warn", "Python ping failed", {
        status: py.status,
        code: py.errorCode,
        correlationId,
      });
      return hybridFailure({
        req,
        code: py.errorCode ?? "PYTHON_SERVICE_UNAVAILABLE",
        message: py.errorMessage ?? "Python ping failed.",
        correlationId,
      });
    }

    const payload =
      py.json && typeof py.json === "object" && "data" in (py.json as object)
        ? (py.json as { data: unknown }).data
        : py.json;

    log(FN, "info", "Python ping ok", { correlationId, latencyMs: py.latencyMs });

    return hybridSuccess({
      req,
      data: payload ?? { pong: true },
      source: "python",
      operationId,
      correlationId,
      meta: { execution_ms: py.latencyMs },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Ping failed.", "INTERNAL_ERROR", 500, req);
  }
});
