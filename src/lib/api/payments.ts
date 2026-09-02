import { invokeFunction } from "@/lib/api/functions";
import {
  openRazorpayCheckout,
  toPaymentUserFacingError,
  type RazorpayProductType,
} from "@/lib/billing/razorpayCheckout";

// Live checkout is Razorpay one-time purchases. Stripe Checkout/portal
// helpers in billing.ts must not be called from pages.

export type RecordReferralResponse = {
  success: boolean;
  result?: {
    ok?: boolean;
    reason?: string;
    referee_credits?: number;
    referrer_credits?: number;
    promo_code?: string;
    discount_percent?: number;
  };
};

export async function recordReferralViaEdge(
  referralCode: string,
): Promise<RecordReferralResponse> {
  return invokeFunction<RecordReferralResponse>("record-referral", {
    referral_code: referralCode,
  });
}

export { openRazorpayCheckout, toPaymentUserFacingError, type RazorpayProductType };
export { PAYMENTS_NOT_CONFIGURED } from "@/lib/billing/razorpayCheckout";

export type PaymentOrderRow = {
  id: string;
  provider: string;
  product_type: string;
  amount_paise: number;
  currency: string;
  status: string;
  credits_granted: number;
  promo_code: string | null;
  created_at: string;
  paid_at: string | null;
};
