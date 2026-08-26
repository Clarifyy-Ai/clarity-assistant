import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/network/idempotency";

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

/** Short QA copy for Razorpay test-mode sandboxes (never Stripe 4242). */
export const RAZORPAY_QA_SANDBOX_HINT =
  "QA (Razorpay test mode): use Razorpay test payment methods — success/failure cards or UPI test. Do not use Stripe 4242.";

/** Show sandbox hints outside production builds. */
export function showRazorpayQaSandboxHint(): boolean {
  if (import.meta.env.DEV) return true;
  const env = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
  return env === "development" || env === "test" || env === "staging";
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

export function toPaymentUserFacingError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/localhost|127\.0\.0\.1|cors|failed to fetch|network/i.test(msg)) {
    return PAYMENT_UNAVAILABLE;
  }
  if (msg.includes("verification")) return "Payment verification failed. Please try again.";
  if (msg === CHECKOUT_PREPARE_ERROR || msg === PAYMENT_UNAVAILABLE) return msg;
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
  onReady?: () => void;
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

    options.onReady?.();

    return await new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay!({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Clarify AI",
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
            options.onDismiss?.();
            resolve();
          },
        },
      });
      rzp.on("payment.failed", (res: unknown) => {
        reject(new Error(PAYMENT_UNAVAILABLE));
        void res;
      });
      rzp.open();
    });
  } catch (err) {
    throw new Error(toPaymentUserFacingError(err));
  } finally {
    checkoutInFlight = false;
  }
}
