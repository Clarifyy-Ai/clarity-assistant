import { mapPaymentOrderDisplayStatus } from "@/lib/billing/paymentStateMachine";

export type BillingHistoryTransactionType = "purchase" | "usage" | "refund" | "bonus";

export type BillingHistoryTransactionStatus =
  | "completed"
  | "pending"
  | "failed"
  | "refunded";

export type BillingHistoryTransaction = {
  id: string;
  date: Date;
  type: BillingHistoryTransactionType;
  description: string;
  amount: number;
  credits: number;
  status: BillingHistoryTransactionStatus;
  invoice_url?: string;
};

export type CreditLedgerRow = {
  id: string;
  amount: number;
  action: string;
  created_at: string;
  description?: string | null;
  stripe_payment_id?: string | null;
};

export type PaymentOrderHistoryRow = {
  id: string;
  product_type: string;
  amount_paise: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  provider: string;
  credits_granted: number;
  provider_payment_id?: string | null;
};

const PURCHASE_LEDGER_ACTIONS = new Set([
  "purchase",
  "subscription_grant",
]);

function isPurchaseLedgerAction(action: string): boolean {
  const base = action.split(":")[0] ?? action;
  return PURCHASE_LEDGER_ACTIONS.has(base);
}

function ledgerTransactionType(
  action: string,
  credits: number,
): BillingHistoryTransactionType {
  const base = action.split(":")[0] ?? action;
  if (base === "refund") return "refund";
  if (base === "bonus" || base === "welcome" || action === "referral_reward") {
    return "bonus";
  }
  if (isPurchaseLedgerAction(action) && credits > 0) return "purchase";
  return "usage";
}

function formatLedgerDescription(action: string, credits: number): string {
  const description = action
    .replace("subscription_grant:", "Subscription: ")
    .replace("purchase:", "Credit purchase: ")
    .replace("refund:", "Refund: ")
    .replace("bonus:", "Bonus: ")
    .replace("usage:", "Used: ")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
  return description || (credits < 0 ? "Credits used" : "Credits added");
}

function paymentOrderToTransaction(
  order: PaymentOrderHistoryRow,
): BillingHistoryTransaction {
  const displayStatus = mapPaymentOrderDisplayStatus(order.status);
  const completed = displayStatus === "completed" && order.status !== "refunded";
  const refunded = order.status === "refunded";
  const creditsGranted =
    typeof order.credits_granted === "number" ? order.credits_granted : 0;

  return {
    id: `order:${order.id}`,
    date: new Date(order.paid_at ?? order.created_at),
    type: refunded ? "refund" : completed ? "purchase" : "usage",
    description: `${order.provider} — ${order.product_type.replace(/_/g, " ")}`,
    amount: order.amount_paise / 100,
    credits: completed ? creditsGranted : 0,
    status: displayStatus,
  };
}

/**
 * Merge payment_orders (purchase state) with credit_transactions (usage/bonus).
 * Purchase/subscription_grant ledger rows tied to a fulfilled payment are omitted
 * to avoid duplicate history lines for the same Razorpay payment.
 */
export function mergeBillingHistoryTransactions(
  ledger: CreditLedgerRow[],
  paymentOrders: PaymentOrderHistoryRow[],
): BillingHistoryTransaction[] {
  const fulfilledPaymentIds = new Set(
    paymentOrders
      .filter((o) => {
        const status = mapPaymentOrderDisplayStatus(o.status);
        return status === "completed" || o.status === "refunded";
      })
      .map((o) => o.provider_payment_id)
      .filter((id): id is string => Boolean(id)),
  );

  const promoPaymentIds = new Set(
    [...fulfilledPaymentIds].map((id) => `${id}_promo`),
  );

  const ledgerRows: BillingHistoryTransaction[] = ledger
    .filter((row) => {
      const action = String(row.action ?? "");
      if (!isPurchaseLedgerAction(action)) return true;
      const paymentId = row.stripe_payment_id?.trim();
      if (!paymentId) return true;
      if (fulfilledPaymentIds.has(paymentId)) return false;
      if (promoPaymentIds.has(paymentId)) return false;
      return true;
    })
    .map((row) => {
      const credits = Number(row.amount ?? 0);
      const action = String(row.action ?? "");
      return {
        id: `ledger:${row.id}`,
        date: new Date(row.created_at),
        type: ledgerTransactionType(action, credits),
        description: formatLedgerDescription(action, credits),
        amount: 0,
        credits,
        status: "completed" as const,
      };
    });

  const orderRows = paymentOrders.map(paymentOrderToTransaction);

  return [...ledgerRows, ...orderRows].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
