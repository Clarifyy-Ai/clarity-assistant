// Thin public alias for `ping` — minimal liveness only.
// Privileged deep checks remain on `ping` with service-role auth; do not duplicate here.

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const corsHeaders = getCorsHeaders(req);

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
