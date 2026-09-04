import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
} from "../_shared/rateLimit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const schema = z.object({
  referral_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,16}$/, "Invalid referral code"),
});

const REASON_TO_HTTP: Record<string, number> = {
  invalid_code: 200,
  code_not_found: 200,
  self_referral: 200,
  programme_disabled: 200,
  already_recorded: 200,
  success: 200,
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const correlationId = crypto.randomUUID();

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
        code: "METHOD_NOT_ALLOWED",
        correlation_id: correlationId,
      }),
      { status: 405, headers },
    );
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const db = createServiceClient();
  const rateLimited = await enforceRateLimitAsync(db, {
    key: createRateLimitKey("record-referral", auth.context.user.id),
    limit: 10,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Invalid JSON payload",
        code: "BAD_REQUEST",
        correlation_id: correlationId,
      }),
      { status: 400, headers },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Invalid referral code",
        code: "REFERRAL_CODE_INVALID",
        correlation_id: correlationId,
        result: { ok: false, reason: "invalid_code" },
      }),
      { status: 400, headers },
    );
  }

  const { data, error } = await db.rpc("record_referral_reward", {
    p_referred_id: auth.context.user.id,
    p_referral_code: parsed.data.referral_code.toUpperCase(),
  });

  if (error) {
    console.error("[record-referral]", {
      correlationId,
      message: error.message?.slice(0, 200),
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to record referral",
        code: "TEMPORARY_BACKEND_FAILURE",
        correlation_id: correlationId,
      }),
      { status: 500, headers },
    );
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    referee_credits?: number;
    referrer_credits?: number;
    promo_code?: string;
    discount_percent?: number;
    attribution_id?: string;
  };

  const reason = String(result.reason ?? (result.ok ? "success" : "unknown"));
  const httpStatus = REASON_TO_HTTP[reason] ?? 200;
  // Transport success whenever RPC returned; business outcome is result.ok + reason.
  const transportOk = true;

  const codeMap: Record<string, string> = {
    invalid_code: "REFERRAL_CODE_INVALID",
    code_not_found: "REFERRAL_CODE_INVALID",
    self_referral: "REFERRAL_SELF_REFERRAL",
    programme_disabled: "REFERRAL_PROGRAMME_DISABLED",
    already_recorded: "REFERRAL_REWARD_ALREADY_GRANTED",
    success: "OK",
  };

  return new Response(
    JSON.stringify({
      success: transportOk,
      code: codeMap[reason] ?? (result.ok ? "OK" : "REFERRAL_REWARD_FAILED"),
      correlation_id: correlationId,
      result,
    }),
    { status: httpStatus, headers },
  );
});
