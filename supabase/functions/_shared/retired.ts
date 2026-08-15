import { handleCors, getCorsHeaders } from "./cors.ts";

export function retiredResponse(req: Request): Response {
  const cors = handleCors(req);
  if (cors) return cors;
  return new Response(
    JSON.stringify({
      error: "This endpoint has been retired.",
      code: "FUNCTION_RETIRED",
    }),
    {
      status: 410,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}
