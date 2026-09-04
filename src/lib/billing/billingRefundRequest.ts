import { SUPPORT_EMAIL } from "@/lib/constants/contact";
import type { BillingHistoryTransaction } from "@/lib/billing/billingHistoryMerge";

/** Completed purchases may request a human review — not an in-app Razorpay refund. */
export function canRequestRefundSupport(
  transaction: Pick<BillingHistoryTransaction, "type" | "status">,
): boolean {
  return transaction.type === "purchase" && transaction.status === "completed";
}

export function billingRefundRequestMailto(opts: {
  description: string;
  transactionId: string;
}): string {
  const subject = encodeURIComponent(`Refund request — ${opts.description}`);
  const body = encodeURIComponent(
    [
      `I would like to request a refund for this purchase.`,
      ``,
      `Transaction: ${opts.transactionId}`,
      `Description: ${opts.description}`,
      ``,
      `Refunds are reviewed case-by-case per the Terms of Service.`,
    ].join("\n"),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
