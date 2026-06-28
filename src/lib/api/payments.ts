import { invokeFunction } from "@/lib/api/functions";
import {
  openRazorpayCheckout,
  type RazorpayProductType,
} from "@/lib/billing/razorpayCheckout";

export type RecordReferralResponse = {
  success: boolean;
  result?: {
    ok?: boolean;
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

export { openRazorpayCheckout, type RazorpayProductType };

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
