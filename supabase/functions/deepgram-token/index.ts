// deepgram-token/index.ts
// Returns a short-lived scoped Deepgram key safe for browser use.
// TTL = 60s — enough to establish the WebSocket handshake, too short to abuse.
// NEVER falls back to returning the raw production key.

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const TOKEN_TTL_SECONDS = 60; // 1 minute — survives WebSocket handshake only

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ── AUTH ──────────────────────────────────────────────────────────── */
    const db         = createServiceClient();
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    // FIX: Use RegExp constructor — /^bearer\\s+/ matches literal \s, not whitespace
    if (!new RegExp("^bearer\\s+", "i").test(authHeader)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(new RegExp("^bearer\\s+", "i"), "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── ENV VALIDATION ────────────────────────────────────────────────── */
    const DEEPGRAM_API_KEY    = Deno.env.get("DEEPGRAM_API_KEY");
    const DEEPGRAM_PROJECT_ID = Deno.env.get("DEEPGRAM_PROJECT_ID");

    if (!DEEPGRAM_API_KEY) {
      console.error("[deepgram-token] DEEPGRAM_API_KEY secret is not set");
      return new Response(
        JSON.stringify({ error: "Transcription service is not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SECURITY: DEEPGRAM_PROJECT_ID is required — we never fall back to the raw key
    if (!DEEPGRAM_PROJECT_ID) {
      console.error("[deepgram-token] DEEPGRAM_PROJECT_ID secret is not set. " +
        "Add it in Supabase Dashboard → Settings → Edge Functions → Secrets. " +
        "Raw API key will NOT be returned as fallback.");
      return new Response(
        JSON.stringify({
          error: "Transcription service misconfigured. Contact support.",
          code:  "MISSING_PROJECT_ID",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ── CREATE SCOPED TEMPORARY KEY ───────────────────────────────────── */
    // POST /v1/projects/{project_id}/keys
    // Returns a key with limited scope + TTL — safe to send to browser.
    // Deepgram validates this key only at WebSocket handshake time, so
    // 60s is sufficient even on slow connections.
    const tempKeyRes = await fetch(
      `https://api.deepgram.com/v1/projects/${DEEPGRAM_PROJECT_ID}/keys`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment:                `session-${user.id.slice(0, 8)}-${Date.now()}`,
          scopes:                 ["usage:write"],        // transcription only
          time_to_live_in_seconds: TOKEN_TTL_SECONDS,
        }),
      },
    );

    if (!tempKeyRes.ok) {
      const errBody = await tempKeyRes.text().catch(() => "");
      console.error(
        "[deepgram-token] Deepgram key creation failed:",
        tempKeyRes.status,
        errBody,
      );
      // Return 502 — do NOT fall back to the raw key
      return new Response(
        JSON.stringify({ error: "Could not create transcription session. Please retry." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const keyData = await tempKeyRes.json() as {
      key_id?: string;
      key?:    string;
    };

    const tempKey = keyData?.key;

    if (!tempKey) {
      console.error("[deepgram-token] Deepgram response missing key field:", JSON.stringify(keyData));
      return new Response(
        JSON.stringify({ error: "Invalid response from transcription service" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /* ── RETURN SCOPED TOKEN ────────────────────────────────────────────── */
    return new Response(
      JSON.stringify({
        token:      tempKey,
        expires_in: TOKEN_TTL_SECONDS,
        key_id:     keyData.key_id ?? null,
        type:       "scoped",
      }),
      {
        status:  200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[deepgram-token] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
