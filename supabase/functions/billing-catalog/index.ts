import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const FALLBACK = {
  pro_monthly: 249_900,
  enterprise_monthly: 679_900,
  credits_50: 69_900,
  credits_150: 189_900,
  credits_500: 599_900,
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("billing_settings")
      .select(
        "pro_monthly_inr_paise, enterprise_monthly_inr_paise, credits_50_inr_paise, credits_150_inr_paise, credits_500_inr_paise",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({
          source: error ? "fallback" : "fallback",
          paise: FALLBACK,
          packs: [
            { id: "credits_50", credits: 50, paise: FALLBACK.credits_50 },
            { id: "credits_150", credits: 150, paise: FALLBACK.credits_150 },
            { id: "credits_500", credits: 500, paise: FALLBACK.credits_500 },
          ],
        }),
        { headers },
      );
    }

    const paise = {
      pro_monthly: Number(data.pro_monthly_inr_paise) || FALLBACK.pro_monthly,
      enterprise_monthly:
        Number(data.enterprise_monthly_inr_paise) || FALLBACK.enterprise_monthly,
      credits_50: Number(data.credits_50_inr_paise) || FALLBACK.credits_50,
      credits_150: Number(data.credits_150_inr_paise) || FALLBACK.credits_150,
      credits_500: Number(data.credits_500_inr_paise) || FALLBACK.credits_500,
    };

    return new Response(
      JSON.stringify({
        source: "billing_settings",
        paise,
        packs: [
          { id: "credits_50", credits: 50, paise: paise.credits_50 },
          { id: "credits_150", credits: 150, paise: paise.credits_150 },
          { id: "credits_500", credits: 500, paise: paise.credits_500 },
        ],
      }),
      { headers },
    );
  } catch (err) {
    console.error("[billing-catalog]", err);
    return new Response(
      JSON.stringify({ source: "fallback", paise: FALLBACK }),
      { headers },
    );
  }
});
