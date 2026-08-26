import { retiredResponse } from "../_shared/retired.ts";

Deno.serve((req) =>
  retiredResponse(req, {
    reason: "stripe_unused_razorpay_only",
    replacement: "razorpay-create-order",
  }),
);
