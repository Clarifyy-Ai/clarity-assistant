/**
 * Shared Razorpay env gating for create-order, verify, and webhook.
 * Placeholders are treated as missing. Never invent secrets.
 */
import { validateBillingConfig } from "./billingConfig.ts";

export const PAYMENTS_NOT_CONFIGURED_ERROR = "Payments are not configured";
export const PAYMENTS_NOT_CONFIGURED_CODE = "PAYMENTS_NOT_CONFIGURED";

export type RazorpayProviderConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  environment: "development" | "staging" | "production";
  keysConfigured: boolean;
  webhookConfigured: boolean;
  /** Checkout (create + verify) may proceed. */
  checkoutConfigured: boolean;
};

function razorpayCheckOk(
  report: ReturnType<typeof validateBillingConfig>,
  name: string,
): boolean {
  const check = report.checks.find((c) => c.name === name);
  return Boolean(check?.present && check.formatValid && check.environmentCompatible);
}

/**
 * Read Razorpay secrets using the same placeholder / format rules as billingConfig.
 */
export function getRazorpayProviderConfig(): RazorpayProviderConfig {
  const report = validateBillingConfig({
    requireStripe: false,
    requireRazorpay: true,
    requireRazorpayWebhook: true,
  });
  const keysConfigured =
    razorpayCheckOk(report, "RAZORPAY_KEY_ID") &&
    razorpayCheckOk(report, "RAZORPAY_KEY_SECRET");
  const webhookConfigured = razorpayCheckOk(report, "RAZORPAY_WEBHOOK_SECRET");
  const productionExtrasOk =
    report.environment !== "production" ||
    report.errors.every((err) => err.startsWith("STRIPE_") || err.startsWith("STRIPE "));

  return {
    keyId: (Deno.env.get("RAZORPAY_KEY_ID") ?? "").trim(),
    keySecret: (Deno.env.get("RAZORPAY_KEY_SECRET") ?? "").trim(),
    webhookSecret: (Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "").trim(),
    environment: report.environment,
    keysConfigured,
    webhookConfigured,
    checkoutConfigured:
      keysConfigured &&
      (report.environment !== "production" || (webhookConfigured && productionExtrasOk)),
  };
}

export function paymentsNotConfiguredBody(): {
  error: string;
  code: string;
} {
  return {
    error: PAYMENTS_NOT_CONFIGURED_ERROR,
    code: PAYMENTS_NOT_CONFIGURED_CODE,
  };
}
