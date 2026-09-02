import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/network/idempotency";
import { ApiClientError } from "@/lib/api/apiClient";
import { trackGoogleAdsPurchase } from "@/lib/ads/googleAds";

export type RazorpayProductType =
  | "pro_monthly"
  | "enterprise_monthly"
  | "credits_50"
  | "credits_150"
  | "credits_500";

export type RazorpayOrderResponse = {
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  payment_order_id: string | null;
  promo_applied: string | null;
  product_type: RazorpayProductType;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (res: unknown) => void) => void;
    };
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

const CHECKOUT_PREPARE_ERROR = "Checkout could not be prepared. Please try again.";
export const PAYMENT_UNAVAILABLE =
  "Payment service is temporarily unavailable.";
export const PAYMENTS_NOT_CONFIGURED =
  "Payments are not configured on this environment. Contact support if you were trying to purchase.";

/** Short QA copy for Razorpay test-mode sandboxes (never Stripe 4242). */
export const RAZORPAY_QA_SANDBOX_HINT =
  "QA (Razorpay test mode): use Razorpay India test methods (test cards/UPI from the Razorpay dashboard). Do not use Stripe 4242 or unsupported international cards — those return international_transaction_not_allowed.";

/** Show sandbox hints outside production builds or when Razorpay test keys are active. */
export function isRazorpaySandboxKey(keyId: string | null | undefined): boolean {
  return typeof keyId === "string" && keyId.trim().startsWith("rzp_test_");
}

export function showRazorpayQaSandboxHint(keyId?: string | null): boolean {
  if (import.meta.env.DEV) return true;
  const env = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
  if (env === "development" || env === "test" || env === "staging") return true;
  return isRazorpaySandboxKey(keyId);
}

/** Require a non-empty internal payment order id before opening Razorpay. */
export function assertInternalOrderId(id: string | null | undefined): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(CHECKOUT_PREPARE_ERROR);
  }
  return id.trim();
}

/** Singleton script load — never append checkout.js more than once. */
let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error(PAYMENT_UNAVAILABLE));
  }
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector(
      `script[src="${RAZORPAY_SCRIPT}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.Razorpay) {
        resolve();
        return;
      }
      const onLoad = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        if (window.Razorpay) resolve();
        else {
          razorpayScriptPromise = null;
          reject(new Error(PAYMENT_UNAVAILABLE));
        }
      };
      const onError = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        razorpayScriptPromise = null;
        reject(new Error(PAYMENT_UNAVAILABLE));
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve();
      else {
        razorpayScriptPromise = null;
        reject(new Error(PAYMENT_UNAVAILABLE));
      }
    };
    script.onerror = () => {
      razorpayScriptPromise = null;
      script.remove();
      reject(new Error(PAYMENT_UNAVAILABLE));
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

function razorpayDescription(productType: RazorpayProductType): string {
  switch (productType) {
    case "pro_monthly":
      return "Pro access (one-time)";
    case "enterprise_monthly":
      return "Max access (one-time)";
    case "credits_50":
      return "50 credits (one-time)";
    case "credits_150":
      return "150 credits (one-time)";
    case "credits_500":
      return "500 credits (one-time)";
  }
}

export function parseRazorpayPaymentFailure(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const error = (res as { error?: Record<string, unknown> }).error;
  if (!error || typeof error !== "object") return null;

  const reason = String(error.reason ?? error.code ?? "").trim();
  const description = String(error.description ?? error.message ?? "").trim();
  const combined = `${reason} ${description}`.trim();

  if (/international_transaction/i.test(combined)) {
    return "This card is not allowed for Razorpay India checkout. Use Razorpay India test cards or UPI from the Razorpay dashboard — not Stripe 4242 or other international cards.";
  }
  if (/SERVER_ERROR|validate\/account|something went wrong/i.test(combined)) {
    return "Razorpay could not validate the payment session. Refresh the page and retry. If this persists, confirm Razorpay sandbox keys and merchant activation — blocked checkout scripts (CSP) also cause this error.";
  }
  if (description) return description;
  if (reason) return reason;
  return null;
}

function errorMeta(err: unknown): { code: string; status: number; msg: string } {
  if (err instanceof ApiClientError) {
    return { code: err.code, status: err.status, msg: err.message };
  }
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : NaN;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return { code, status, msg };
}

export function toPaymentUserFacingError(err: unknown): string {
  const { code, status, msg } = errorMeta(err);

  // Auth failures must not be masked as a generic payment outage (TC-REG-006/013).
  if (
    status === 401 ||
    code === "AUTH_REQUIRED" ||
    code === "AUTH_EXPIRED" ||
    code === "AUTH_INVALID" ||
    /AUTH_(REQUIRED|EXPIRED|INVALID)|unauthorized|invalid or expired token/i.test(
      `${code} ${msg}`,
    )
  ) {
    return "Your session expired. Please sign in again and retry checkout.";
  }
  if (code === "BILLING_PAST_DUE" || (status === 403 && !/disabled/i.test(msg))) {
    return msg || "Update your payment method to continue.";
  }
  if (code === "PRICE_UNAVAILABLE" || /checkout is not available/i.test(msg)) {
    return "Checkout is not available for this product right now. Please try again later.";
  }
  if (code === "VALIDATION_ERROR" || /invalid product_type/i.test(msg)) {
    return "That plan or credit pack is not available for checkout.";
  }
  if (
    code === "ORDER_PERSIST_FAILED" ||
    code === "PROVIDER_ORDER_INVALID" ||
    /could not start checkout/i.test(msg)
  ) {
    return "Checkout could not be prepared. Please try again.";
  }
  if (
    status === 503 ||
    code === "PAYMENTS_NOT_CONFIGURED" ||
    code === "BILLING_CONFIG_INVALID" ||
    /payments are not configured|integration not configured|razorpay not configured|billing configuration invalid/i.test(
      msg,
    )
  ) {
    return PAYMENTS_NOT_CONFIGURED;
  }
  if (code === "PROVIDER_UNAVAILABLE" || status === 502) {
    return "Payment provider is temporarily unavailable. Please try again in a moment.";
  }
  if (code === "PAYMENT_FULFILLMENT_FAILED") {
    return "Payment was received but credits could not be granted. Contact support with your payment reference — you will not be charged twice.";
  }
  if (code === "PAYMENT_NOT_CAPTURED") {
    return "Payment is not complete yet. Finish checkout and try again.";
  }
  if (code === "INVALID_ORDER_STATE" || status === 409) {
    return "This checkout session is no longer valid. Start a new purchase.";
  }
  if (/payment failed|international_transaction|card.*(declined|not allowed)/i.test(msg)) {
    return "Payment was declined by the provider. Use Razorpay India test cards or UPI — not Stripe 4242 or unsupported international cards.";
  }
  if (/uh oh|validate\/account|server_error/i.test(msg)) {
    return "Razorpay checkout failed to open. Refresh and retry with India sandbox payment methods.";
  }
  if (/localhost|127\.0\.0\.1|cors|failed to fetch|network/i.test(msg)) {
    return PAYMENT_UNAVAILABLE;
  }
  if (msg.includes("verification")) return "Payment verification failed. Please try again.";
  if (msg === CHECKOUT_PREPARE_ERROR || msg === PAYMENT_UNAVAILABLE) return msg;
  if (msg && msg !== "Error" && msg.length < 180) return msg;
  return PAYMENT_UNAVAILABLE;
}

let checkoutInFlight = false;
/** Reuse the same idempotency key for a product+promo within this window (one Buy → one logical order). */
const ORDER_KEY_TTL_MS = 300_000;
const recentOrderKeys = new Map<string, { key: string; createdAt: number }>();

function checkoutOrderKey(productType: RazorpayProductType, promoCode?: string): string {
  const key = `${productType}:${(promoCode ?? "").trim().toUpperCase()}`;
  const now = Date.now();
  const existing = recentOrderKeys.get(key);
  if (existing && now - existing.createdAt < ORDER_KEY_TTL_MS) return existing.key;
  const generated = createIdempotencyKey(`razorpay-create-order:${productType}`);
  recentOrderKeys.set(key, { key: generated, createdAt: now });
  return generated;
}

export async function cancelRazorpayOrder(paymentOrderId: string): Promise<void> {
  await fetchEdgeJson(
    "razorpay-create-order",
    {
      action: "cancel",
      payment_order_id: paymentOrderId,
    },
    { timeoutMs: 15_000 },
  );
}

export async function failRazorpayOrder(paymentOrderId: string): Promise<void> {
  await fetchEdgeJson(
    "razorpay-create-order",
    {
      action: "fail",
      payment_order_id: paymentOrderId,
    },
    { timeoutMs: 15_000 },
  );
}

export async function createRazorpayOrder(
  productType: RazorpayProductType,
  promoCode?: string,
  idempotencyKey?: string,
): Promise<RazorpayOrderResponse> {
  const key = idempotencyKey ?? createIdempotencyKey("razorpay-create-order");
  return fetchEdgeJson<RazorpayOrderResponse>(
    "razorpay-create-order",
    {
      product_type: productType,
      promo_code: promoCode,
    },
    {
      headers: {
        "x-idempotency-key": key,
      },
    },
  );
}

export async function openRazorpayCheckout(options: {
  productType: RazorpayProductType;
  promoCode?: string;
  userEmail?: string;
  userName?: string;
  /** Fired after the order is created and Razorpay is about to open. */
  onReady?: (order: RazorpayOrderResponse) => void;
  onSuccess?: () => void;
  onDismiss?: () => void;
}): Promise<void> {
  if (checkoutInFlight) {
    throw new Error("A checkout is already in progress.");
  }
  checkoutInFlight = true;
  const orderKey = checkoutOrderKey(options.productType, options.promoCode);

  try {
    // Order first — never load checkout.js / open modal without a valid order.
    const order = await createRazorpayOrder(
      options.productType,
      options.promoCode,
      orderKey,
    );
    assertInternalOrderId(order.payment_order_id);
    await loadRazorpayScript();

    if (!window.Razorpay) {
      throw new Error(PAYMENT_UNAVAILABLE);
    }

    options.onReady?.(order);

    return await new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay!({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Career Pilot",
        description: razorpayDescription(options.productType),
        order_id: order.order_id,
        prefill: {
          email: options.userEmail,
          name: options.userName,
        },
        theme: { color: "#6366f1" },
        handler: (response: {
          razorpay_order_id?: string;
          razorpay_payment_id?: string;
          razorpay_signature?: string;
        }) => {
          void fetchEdgeJson("razorpay-verify-payment", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          })
            .then(() => {
              trackGoogleAdsPurchase({
                amountPaise: order.amount,
                currency: order.currency,
                transactionId: order.order_id,
              });
              options.onSuccess?.();
              resolve();
            })
            .catch((error: unknown) => {
              reject(
                error instanceof Error
                  ? error
                  : new Error("Payment verification failed"),
              );
            });
        },
        modal: {
          ondismiss: () => {
            void cancelRazorpayOrder(order.payment_order_id!).catch(() => {
              /* best-effort — user dismissed without paying */
            });
            options.onDismiss?.();
            resolve();
          },
        },
      });
      rzp.on("payment.failed", (res: unknown) => {
        void failRazorpayOrder(order.payment_order_id!).catch(() => {
          /* best-effort — mark order failed server-side */
        });
        const detail = parseRazorpayPaymentFailure(res);
        reject(
          new Error(
            detail
              ? `Payment failed: ${detail}`
              : "Payment failed. No credits were granted.",
          ),
        );
      });
      rzp.open();
    });
  } catch (err) {
    throw new Error(toPaymentUserFacingError(err));
  } finally {
    checkoutInFlight = false;
  }
}
