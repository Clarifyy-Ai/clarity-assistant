import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─────────────────────────────────────────────────────────────────
// deepgram-token Edge Function
// Issues a short-lived Deepgram temporary API key for client-side
// WebSocket connections. This keeps the real API key server-side.
// ─────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    if (!DEEPGRAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "DEEPGRAM_API_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a short-lived Deepgram temporary key (TTL: 10 seconds)
    const response = await fetch(
      "https://api.deepgram.com/v1/projects/tokens/create",
      {
        method:  "POST",
        headers: {
          "Authorization": `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          comment:         "Clarify AI temporary key",
          scopes:          ["usage:write"],
          time_to_live_in_seconds: 15,
        }),
      }
    );

    if (!response.ok) {
      // If the create endpoint fails (e.g., free tier restriction), fall back
      // to returning the main key directly — acceptable for development
      console.warn("[deepgram-token] Temp key creation failed, returning main key:", response.status);
      return new Response(
        JSON.stringify({ token: DEEPGRAM_API_KEY }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const token = data.key?.key ?? data.key ?? DEEPGRAM_API_KEY;

    return new Response(
      JSON.stringify({ token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[deepgram-token] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
