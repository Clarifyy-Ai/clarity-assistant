import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const schema = z.object({
  referral_code: z.string().trim().min(6).max(16),
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return new Response(auth.error.body, {
      status: auth.error.status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const body = await parseJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid referral code" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("record_referral_reward", {
    p_referred_id: auth.context.user.id,
    p_referral_code: parsed.data.referral_code.toUpperCase(),
  });

  if (error) {
    console.error("[record-referral]", error.message);
    return new Response(JSON.stringify({ error: "Failed to record referral" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, result: data }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
