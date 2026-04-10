// deepgram-token/index.ts — Returns a scoped temporary Deepgram API key
// The temp key is safe to expose to the browser (expires in 1 hour).

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ── AUTHENTICATE USER ── */
    const db = createServiceClient();
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── ENV VALIDATION ── */
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    const DEEPGRAM_PROJECT_ID = Deno.env.get("DEEPGRAM_PROJECT_ID");

    if (!DEEPGRAM_API_KEY) {
      return new Response(JSON.stringify({ error: "Deepgram key missing" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── TRY SCOPED TEMPORARY KEY ── */
    if (DEEPGRAM_PROJECT_ID) {
      try {
        const tempKeyRes = await fetch(
          `https://api.deepgram.com/v1/projects/${DEEPGRAM_PROJECT_ID}/keys`,
          {
            method: "POST",
            headers: {
              Authorization: `Token ${DEEPGRAM_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              comment: `temp-${user.id.slice(0, 8)}-${Date.now()}`,
              scopes: ["usage:write"],
              time_to_live_in_seconds: 3600,
            }),
          }
        );

        if (tempKeyRes.ok) {
          const keyData = await tempKeyRes.json();
          const tempKey = keyData?.key;
          if (tempKey) {
            return new Response(
              JSON.stringify({ token: tempKey, expires_in: 3600, type: "scoped" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          const errText = await tempKeyRes.text().catch(() => "");
          console.warn("[deepgram-token] Temp key creation failed:", tempKeyRes.status, errText);
        }
      } catch (err) {
        console.warn("[deepgram-token] Temp key API error:", err);
      }
    }

    /* ── FALLBACK: return raw key (if no project ID or temp key failed) ── */
    console.warn("[deepgram-token] Falling back to raw API key. Set DEEPGRAM_PROJECT_ID for scoped keys.");
    return new Response(
      JSON.stringify({ token: DEEPGRAM_API_KEY, type: "raw" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[deepgram-token] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
