import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { rpcJson } from "../_shared/sessionLifecycleRpc.ts";
import { logProductEvent } from "../_shared/productEvents.ts";

const schema = z.object({
  session_id: z.string().uuid(),
  terminal_reason: z.string().max(40).optional(),
  answers: z.array(z.object({
    question_index: z.number().int().nonnegative(),
    question: z.string().max(10000),
    answer: z.string().max(50000).nullable().optional(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
  })).max(100).optional().default([]),
  transcript: z.object({
    content: z.string().max(500000),
    utterances: z.unknown().optional(),
  }).nullable().optional(),
  metrics: z.record(z.unknown()).optional().default({}),
});

function json(req: Request, status: number, body: unknown) {
  const headers = new Headers(getCorsHeaders(req));
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
  const auth = await authenticateRequest(req);
  if (auth.error) return withCorsHeaders(req, auth.error);
  try {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) return json(req, 422, { error: "Validation failed.", code: "VALIDATION_ERROR" });
    const db = createServiceClient();
    const { data, error } = await rpcJson(db, "finalize_owned_session", {
      p_user_id: auth.context.user.id,
      p_session_id: parsed.data.session_id,
      p_terminal_reason: parsed.data.terminal_reason ?? "USER_ENDED",
      p_answers: parsed.data.answers,
      p_transcript: parsed.data.transcript ?? null,
      p_metrics: parsed.data.metrics,
    });
    if (error) {
      logProductEvent("session_finalize_failure", {
        user_id: auth.context.user.id,
        session_id: parsed.data.session_id,
        code: "RPC_ERROR",
        detail: error.message ?? "unknown",
      });
      console.error("[finalize-session] rpc:", error);
      return json(req, 500, { error: "Could not finalize session.", code: "FINALIZATION_FAILED" });
    }
    if (data.reason === "NOT_FOUND" || data.ok === false) {
      logProductEvent("session_finalize_failure", {
        user_id: auth.context.user.id,
        session_id: parsed.data.session_id,
        code: String(data.reason ?? "NOT_FOUND"),
      });
      return json(req, 404, { error: "Session not found.", code: "NOT_FOUND" });
    }
    return json(req, 200, data);
  } catch (error) {
    console.error("[finalize-session] unhandled:", error);
    return json(req, 500, { error: "Could not finalize session.", code: "FINALIZATION_FAILED" });
  }
});
