// deepgram-token/index.ts — SECURED VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ------------------------------
       AUTHENTICATE USER
    ------------------------------ */
    const db = createServiceClient();

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
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
        headers: corsHeaders,
      });
    }

    /* ------------------------------
       ENV VALIDATION
    ------------------------------ */
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");

    if (!DEEPGRAM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Deepgram key missing" }),
        { status: 503, headers: corsHeaders }
      );
    }

    /* ------------------------------
       REQUEST TEMPORARY TOKEN
    ------------------------------ */
    const temp = await fetch(
      "https://api.deepgram.com/v1/projects/tokens/create",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: `temp-key for user ${user.id}`,
          time_to_live_in_seconds: 60, // safer TTL
          scopes: [
            "usage:write",
            "read:usage",
            "write:streams",
            "listen:streams",
          ],
        }),
      }
    );

    if (!temp.ok) {
      const body = await temp.text();
      console.error("[deepgram-token] temp key error:", temp.status, body);

      // IMPORTANT:
      // Never return main key.
      return new Response(
        JSON.stringify({ error: "Failed to create temp token" }),
        { status: 502, headers: corsHeaders }
      );
    }

    const json = await temp.json();
    const tokenOut = json.key?.key ?? json.key;

    return new Response(JSON.stringify({ token: tokenOut }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[deepgram-token] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
``
