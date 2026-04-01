import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
