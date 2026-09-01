// stripe-webhook/index.ts
//
// RETIRED payment surface. Stripe is not an active billing provider.
// Signature handling stays fail-closed so forged events cannot mint credits.
// Career Pilot launch billing is Razorpay one-time purchases — this
// endpoint never grants plan entitlements or credits.

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { opsLog } from "../_shared/opsLog.ts";
import { reportEdgeError } from "../_shared/errors.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")
  ?? Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")
  ?? "";

function isProductionEnv(): boolean {
  const raw = (Deno.env.get("APP_ENV") ?? Deno.env.get("ENVIRONMENT") ?? "")
    .trim()
    .toLowerCase();
  return raw === "production" || raw === "prod";
}

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const parts = signature.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const sigPart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !sigPart) {
    console.error("[stripe-webhook] Malformed stripe-signature header");
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const expectedSig = sigPart.slice(3);

  const nowSec = Math.floor(Date.now() / 1000);
  const tsSec = parseInt(timestamp, 10);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > 300) {
    console.error("[stripe-webhook] Stale or invalid timestamp — possible replay attack");
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );

  const hexSig = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (hexSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < hexSig.length; i++) {
    diff |= hexSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured — refusing to process events.",
    );
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured" }),
      { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    if (!signature) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      opsLog({
        function_name: "stripe-webhook",
        operation: "verify_signature",
        result: "denied",
        error_class: "INVALID_SIGNATURE",
        retryable: false,
      });
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    let event: { id?: string; type?: string; livemode?: boolean };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    if (isProductionEnv() && event.livemode === false) {
      opsLog({
        function_name: "stripe-webhook",
        operation: "livemode_guard",
        result: "denied",
        provider: "stripe",
        provider_event_id: event.id,
        error_class: "TEST_MODE_IN_PRODUCTION",
        retryable: false,
      });
      return new Response(
        JSON.stringify({ error: "Test-mode events rejected in production" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    opsLog({
      function_name: "stripe-webhook",
      operation: event.type ?? "unknown",
      result: "ok",
      provider: "stripe",
      provider_event_id: event.id,
      meta: { ignored: true, reason: "stripe_unused_razorpay_only" },
    });

    return new Response(
      JSON.stringify({
        received: true,
        ignored: true,
        code: "FUNCTION_RETIRED",
        status: "retired",
        reason: "stripe_unused_razorpay_only",
        replacement: "razorpay-create-order",
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const requestId = await reportEdgeError(err, {
      functionName: "stripe-webhook",
      operation: "handler",
    });
    opsLog({
      function_name: "stripe-webhook",
      operation: "handler",
      result: "error",
      error_class: "UNHANDLED",
      retryable: true,
      meta: {
        message: err instanceof Error ? err.message : "unknown",
        requestId,
      },
    });
    console.error("[stripe-webhook] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});
