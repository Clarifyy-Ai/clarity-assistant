import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  handleCors,
  getCorsHeaders,
  withCorsHeaders,
} from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { rpcJson } from "../_shared/sessionLifecycleRpc.ts";

const endSchema = z.object({
  session_id: z.string().uuid("Invalid session ID."),
  terminal_reason: z
    .enum([
      "USER_ENDED",
      "SESSION_TIMEOUT",
      "AUTH_EXPIRED",
      "DAILY_LIMIT_REACHED",
      "CREDITS_EXHAUSTED",
      "PROVIDER_UNAVAILABLE",
      "ACCOUNT_RESTRICTED",
      "SYSTEM_ERROR",
      "CANCELLED",
      "FAILED",
    ])
    .optional()
    .default("USER_ENDED"),
});

function json(corsHeaders: HeadersInit, status: number, body: unknown): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return json(corsHeaders, 405, {
        error: "Method not allowed.",
        code: "METHOD_NOT_ALLOWED",
      });
    }

    const auth = await authenticateRequest(req);
    if (auth.error) return withCorsHeaders(req, auth.error);
    const { user } = auth.context;

    let rawBody: unknown;
    try {
      rawBody = await parseJsonBody(req);
    } catch {
      return json(corsHeaders, 400, {
        error: "Invalid JSON payload.",
        code: "BAD_REQUEST",
      });
    }

    const parsed = endSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(corsHeaders, 422, {
        error: "Validation failed.",
        code: "VALIDATION_ERROR",
      });
    }

    const db = createServiceClient();
    const { data, error } = await rpcJson(db, "end_owned_session", {
      p_user_id: user.id,
      p_session_id: parsed.data.session_id,
      p_terminal_reason: parsed.data.terminal_reason,
      p_lifecycle_status: parsed.data.terminal_reason === "SESSION_TIMEOUT"
        ? "EXPIRED"
        : parsed.data.terminal_reason === "USER_ENDED"
          ? "COMPLETED"
          : parsed.data.terminal_reason === "CANCELLED"
            ? "CANCELLED"
            : parsed.data.terminal_reason === "FAILED" ||
                parsed.data.terminal_reason === "SYSTEM_ERROR" ||
                parsed.data.terminal_reason === "PROVIDER_UNAVAILABLE"
              ? "FAILED"
              : parsed.data.terminal_reason === "AUTH_EXPIRED"
                ? "INTERRUPTED"
                : "COMPLETED",
    });

    if (error) {
      console.error("[end-session] rpc:", error);
      return json(corsHeaders, 500, {
        error: "Could not end session.",
        code: "INTERNAL_ERROR",
      });
    }

    if (data.reason === "NOT_FOUND" || data.ok === false) {
      return json(corsHeaders, 404, {
        error: "Session not found.",
        code: "NOT_FOUND",
      });
    }

    return json(corsHeaders, 200, {
      session_id: data.session_id,
      status: data.status,
      lifecycle_status: data.lifecycle_status,
      terminal_reason: data.terminal_reason,
      ended_at: data.ended_at,
      duration_seconds: data.duration_seconds,
      already_terminal: Boolean(data.already_terminal),
    });
  } catch (err) {
    console.error("[end-session] Unhandled error:", err);
    return json(getCorsHeaders(req), 500, {
      error: "Could not end session.",
      code: "INTERNAL_ERROR",
    });
  }
});
