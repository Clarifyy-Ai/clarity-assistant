import { handleCors, getCorsHeaders } from "./cors.ts";

export type RetiredReason =
  | "stripe_unused_razorpay_only"
  | "billing_provider_migrated";

export function retiredResponse(
  req: Request,
  opts?: { reason?: RetiredReason; replacement?: string },
): Response {
  const cors = handleCors(req);
  if (cors) return cors;
  return new Response(
    JSON.stringify({
      error: "This endpoint has been retired.",
      code: "FUNCTION_RETIRED",
      reason: opts?.reason ?? "billing_provider_migrated",
      replacement: opts?.replacement ?? "razorpay-create-order",
      status: "retired",
    }),
    {
      status: 410,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}
