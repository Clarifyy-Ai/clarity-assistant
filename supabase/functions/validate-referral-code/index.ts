/**
 * Public validate-referral-code — rate-limited, no PII.
 * Returns { valid, programmeVersion } only.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
} from "../_shared/rateLimit.ts";
import { getClientIp } from "../_shared/auth.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const schema = z.object({
  referral_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,16}$/, "Invalid referral code"),
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers,
    });
  }

  const db = createServiceClient();
  const rateLimited = await enforceRateLimitAsync(db, {
    key: createRateLimitKey("validate-referral-code", getClientIp(req) || "anon"),
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch {
    return new Response(
      JSON.stringify({ valid: false, programmeVersion: null, code: "BAD_REQUEST" }),
      { status: 200, headers },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ valid: false, programmeVersion: null, code: "REFERRAL_CODE_INVALID" }),
      { status: 200, headers },
    );
  }

  const code = parsed.data.referral_code.toUpperCase();
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .ilike("referral_code", code)
    .maybeSingle();

  const now = new Date().toISOString();
  const { data: programme } = await db
    .from("referral_programmes")
    .select("version, status, start_at, end_at")
    .eq("status", "active")
    .lte("start_at", now)
    .or(`end_at.is.null,end_at.gt.${now}`)
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const programmeActive =
    programme?.status === "active" &&
    Boolean(programme.start_at) &&
    new Date(programme.start_at) <= new Date() &&
    (!programme.end_at || new Date(programme.end_at) > new Date());
  const valid = Boolean(profile?.id) && programmeActive;

  return new Response(
    JSON.stringify({
      valid,
      programmeVersion: programmeActive ? programme?.version ?? null : null,
      code: valid
        ? "OK"
        : !programmeActive
          ? "REFERRAL_PROGRAMME_DISABLED"
          : "REFERRAL_CODE_INVALID",
    }),
    { status: 200, headers },
  );
});
