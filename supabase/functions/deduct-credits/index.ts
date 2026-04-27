// supabase/functions/deduct-credits/index.ts
// Secure credit deduction endpoint for all AI actions. [file:1][file:3]

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCreditsAtomic } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);
  const db = createServiceClient();

  try {
    // ── AUTH ─────────────────────────────────────────────────────
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!/^bearer\s+/i.test(authHeader)) {
      return json(headers, 401, { error: "Unauthorized" });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return json(headers, 401, { error: "Unauthorized" });
    }

    // ── BODY PARSE & VALIDATION ──────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.action) {
      return json(headers, 400, { error: "Missing action" });
    }

    const action: string = body.action;
    const cost: number = Number(body.cost ?? 0);
    const sessionId: string | null = body.session_id ?? null;

    if (!Number.isFinite(cost) || cost <= 0) {
      return json(headers, 400, { error: "Invalid cost" });
    }

    // ── DEDUCT CREDITS (ATOMIC) ──────────────────────────────────
    const result = await deductCreditsAtomic({
      userId: user.id,
      action,
      cost,
      sessionId,
    });

    if (!result.success) {
      const message =
        result.error && result.error.toLowerCase().includes("insufficient")
          ? result.error
          : "Credit deduction failed";

      // Use 402 for insufficient credits so frontend can show upgrade. [file:1][file:3]
      const status = message.toLowerCase().includes("insufficient") ? 402 : 500;
      return json(headers, status, { error: message });
    }

    return json(headers, 200, {
      credits_remaining: result.balanceAfter ?? 0,
    });
  } catch (err) {
    console.error("[deduct-credits] Unhandled error:", err);
    return json(headers, 500, { error: "Internal server error" });
  }
});

/* ──────────────────────────────────────────────────────────────── */

function json(headers: HeadersInit, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
