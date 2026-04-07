// deepgram-token/index.ts — Returns Deepgram API key for authenticated users
// The key is used client-side for WebSocket STT connections only.

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ── AUTHENTICATE USER ── */
    const db = createServiceClient();

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── ENV VALIDATION ── */
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");

    if (!DEEPGRAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Deepgram key missing" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ── RETURN KEY ──
       The key is returned to authenticated users only.
       Client uses it for WebSocket STT connections.
       For production, consider Deepgram's managed key rotation. */
    return new Response(JSON.stringify({ token: DEEPGRAM_API_KEY }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[deepgram-token] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
