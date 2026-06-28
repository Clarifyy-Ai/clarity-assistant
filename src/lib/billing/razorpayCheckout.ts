import { fetchEdgeJson } from "@/lib/network/fetchEdge";

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

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

export async function createRazorpayOrder(
  productType: RazorpayProductType,
  promoCode?: string,
): Promise<RazorpayOrderResponse> {
  return fetchEdgeJson<RazorpayOrderResponse>("razorpay-create-order", {
    product_type: productType,
    promo_code: promoCode,
  });
}

export async function openRazorpayCheckout(options: {
  productType: RazorpayProductType;
  promoCode?: string;
  userEmail?: string;
  userName?: string;
  onSuccess?: () => void;
  onDismiss?: () => void;
}): Promise<void> {
  const order = await createRazorpayOrder(options.productType, options.promoCode);
  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error("Razorpay checkout unavailable");
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "Clarify AI",
      description: options.productType.replace(/_/g, " "),
      order_id: order.order_id,
      prefill: {
        email: options.userEmail,
        name: options.userName,
      },
      theme: { color: "#6366f1" },
      handler: () => {
        options.onSuccess?.();
        resolve();
      },
      modal: {
        ondismiss: () => {
          options.onDismiss?.();
          resolve();
        },
      },
    });
    rzp.open();
  });
}
