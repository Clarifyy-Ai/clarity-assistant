/**
 * Public list-public-promos — rate-limited, no auth.
 * Returns active, non-expired, non-exhausted promo codes for marketing pages.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
} from "../_shared/rateLimit.ts";
import { getClientIp } from "../_shared/auth.ts";

type PromoRow = {
  code: string;
  discount_percent: number | null;
  bonus_credits: number | null;
  valid_from: string;
  valid_until: string | null;
  description: string | null;
  is_active: boolean;
  max_redemptions: number | null;
  redemption_count: number | null;
  created_at: string;
};

function isPromoPubliclyVisible(row: PromoRow, now = new Date()): boolean {
  if (!row.is_active) return false;
  if (row.valid_from && new Date(row.valid_from) > now) return false;
  if (row.valid_until && new Date(row.valid_until) <= now) return false;
  const used = row.redemption_count ?? 0;
  if (row.max_redemptions != null && used >= row.max_redemptions) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers,
    });
  }

  const db = createServiceClient();
  const rateLimited = await enforceRateLimitAsync(db, {
    key: createRateLimitKey("list-public-promos", getClientIp(req) || "anon"),
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const { data, error } = await db
      .from("promo_codes")
      .select(
        "code, discount_percent, bonus_credits, valid_from, valid_until, description, is_active, max_redemptions, redemption_count, created_at",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[list-public-promos]", error);
      return new Response(JSON.stringify({ offers: [] }), { headers });
    }

    const now = new Date();
    const offers = (data ?? [])
      .filter((row) => isPromoPubliclyVisible(row as PromoRow, now))
      .map((row) => ({
        code: String(row.code ?? "").trim().toUpperCase(),
        discount_percent: Number(row.discount_percent ?? 0),
        bonus_credits: Number(row.bonus_credits ?? 0),
        valid_until: row.valid_until ?? null,
        description: row.description ?? null,
      }))
      .filter((row) => row.code.length >= 4);

    return new Response(JSON.stringify({ offers }), { headers });
  } catch (err) {
    console.error("[list-public-promos]", err);
    return new Response(JSON.stringify({ offers: [] }), { headers });
  }
});
