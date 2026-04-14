import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { ..."Content-Type": "application/json" },
  });
});
