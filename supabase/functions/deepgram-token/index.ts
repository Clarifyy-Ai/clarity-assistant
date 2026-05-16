// deepgram-token/index.ts
// Returns a short-lived scoped Deepgram key safe for browser use.
// TTL = 60s — enough to establish the WebSocket handshake, too short to abuse.
// NEVER falls back to returning the raw production key.

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const TOKEN_TTL_SECONDS = 60; // 1 minute — survives WebSocket handshake only

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);

  try {
    /* ── AUTH ──────────────────────────────────────────────────────────── */
    const db = createServiceClient();
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!new RegExp("^bearer\\s+", "i").test(authHeader)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(new RegExp("^bearer\\s+", "i"), "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    /* ── ENV VALIDATION ────────────────────────────────────────────────── */
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    const DEEPGRAM_PROJECT_ID = Deno.env.get("DEEPGRAM_PROJECT_ID");

    if (!DEEPGRAM_API_KEY) {
      console.error("[deepgram-token] DEEPGRAM_API_KEY secret is not set");
      return new Response(
        JSON.stringify({ error: "Transcription service is not configured" }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    if (!DEEPGRAM_PROJECT_ID) {
      console.error("[deepgram-token] DEEPGRAM_PROJECT_ID secret is not set.");
      return new Response(
        JSON.stringify({
          error: "Transcription service misconfigured. Contact support.",
          code: "MISSING_PROJECT_ID",
        }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    /* ── CREATE SCOPED TEMPORARY KEY ───────────────────────────────────── */
    // Deepgram indicates a temp key only needs ['usage:write'] for transcription. 【1-34e357】
    // NOTE: The MANAGEMENT key (DEEPGRAM_API_KEY) used here must include keys:write to create keys. 【1-34e357】
    const tempKeyRes = await fetch(
      `https://api.deepgram.com/v1/projects/${DEEPGRAM_PROJECT_ID}/keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: `session-${user.id.slice(0, 8)}-${Date.now()}`,
          scopes: ["usage:write"], // ✅ correct for STT usage 【1-34e357】
          time_to_live_in_seconds: TOKEN_TTL_SECONDS,
        }),
      },
    );

    if (!tempKeyRes.ok) {
      const errBody = await tempKeyRes.text().catch(() => "");
      console.error("[deepgram-token] Deepgram key creation failed:", tempKeyRes.status, errBody);
      return new Response(
        JSON.stringify({
          error: "Could not create transcription session. Please retry.",
          details: "If this persists, ensure DEEPGRAM_API_KEY has keys:write scope.",
        }),
        { status: 502, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const keyData = await tempKeyRes.json() as { key_id?: string; key?: string };
    const tempKey = keyData?.key;

    if (!tempKey) {
      console.error("[deepgram-token] Deepgram response missing key field:", JSON.stringify(keyData));
      return new Response(
        JSON.stringify({ error: "Invalid response from transcription service" }),
        { status: 502, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    /* ── RETURN SCOPED TOKEN ────────────────────────────────────────────── */
    return new Response(
      JSON.stringify({
        token: tempKey,
        expires_in: TOKEN_TTL_SECONDS,
        key_id: keyData.key_id ?? null,
        type: "scoped",
      }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[deepgram-token] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});
