/**
 * Local runtime evidence for remediation session 70dd4b — not a Playwright/test file.
 */
import { appendFileSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOG = resolve("debug-70dd4b.log");
const sessionId = "70dd4b";

function log(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId,
    runId: "local-evidence",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  appendFileSync(LOG, line + "\n", "utf8");
  console.log(line);
}

writeFileSync(LOG, "", "utf8");

function mapPaymentStatus(status) {
  const isCompleted = (s) => s === "paid" || s === "fulfilled";
  const isFailed = (s) => s === "failed" || s === "cancelled" || s === "canceled";
  const isRefunded = (s) => s === "refunded";
  const completed = isCompleted(status);
  const refunded = isRefunded(status);
  const failed = isFailed(status);
  return {
    type: refunded ? "refund" : completed ? "purchase" : "usage",
    status: completed || refunded ? "completed" : failed ? "failed" : "pending",
  };
}

const statusCases = ["fulfilled", "paid", "created", "failed", "refunded", "cancelled"].map((s) => ({
  input: s,
  ...mapPaymentStatus(s),
}));
log("H-BILL-006", "verify-script:status-map", "payment status mapping", {
  fulfilledOk: mapPaymentStatus("fulfilled").status === "completed",
  paidOk: mapPaymentStatus("paid").status === "completed",
  createdPending: mapPaymentStatus("created").status === "pending",
  statusCases,
});

// Mirror toPaymentUserFacingError auth branch (source of truth in razorpayCheckout.ts)
function toPaymentUserFacingError(err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code ?? "") : "";
  const status = err && typeof err === "object" && "status" in err ? Number(err.status) : NaN;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (
    status === 401 ||
    code === "AUTH_REQUIRED" ||
    code === "AUTH_EXPIRED" ||
    code === "AUTH_INVALID" ||
    /AUTH_(REQUIRED|EXPIRED|INVALID)|unauthorized|invalid or expired token/i.test(`${code} ${msg}`)
  ) {
    return "Your session expired. Please sign in again and retry checkout.";
  }
  if (/payment failed|international_transaction|card.*(declined|not allowed)/i.test(msg)) {
    return "Payment was declined by the provider. Try another Razorpay test method (India cards/UPI), not an unsupported international card.";
  }
  return "Payment service is temporarily unavailable.";
}

const authFacing = toPaymentUserFacingError({
  message: "Invalid or expired token",
  code: "AUTH_INVALID",
  status: 401,
});
const declinedFacing = toPaymentUserFacingError(
  new Error("Payment failed: international_transaction_not_allowed"),
);
log("H-BILL-401", "verify-script:facing-errors", "user-facing payment errors", {
  authFacing,
  authIsSessionMsg: /sign in again/i.test(authFacing),
  declinedMentionsCard: /international|test method|declined/i.test(declinedFacing),
});

const pastDueSrc = readFileSync(resolve("supabase/functions/_shared/billingPastDue.ts"), "utf8");
log("H-BILL-VERIFY", "verify-script:past-due", "past-due allowlist", {
  verifyAllowed: pastDueSrc.includes('"razorpay-verify-payment"'),
});

const hotkeysSrc = readFileSync(resolve("src/lib/constants/hotkeys.ts"), "utf8");
const goAnswersMatch = hotkeysSrc.match(/GO_ANSWERS:\s*\{[\s\S]*?keys:\s*"([^"]+)"/);
log("H-SET-006", "verify-script:hotkey", "GO_ANSWERS default", {
  keys: goAnswersMatch?.[1] ?? null,
  notBrowserClose: goAnswersMatch?.[1] !== "Ctrl+Shift+W",
});

const billingSrc = readFileSync(resolve("src/pages/app/settings/SettingsBilling.tsx"), "utf8");
log("H-BILL-006", "verify-script:wire", "BillingHistory mount", {
  importsBillingHistory: /import\s*\{\s*BillingHistory\s*\}/.test(billingSrc),
  rendersBillingHistory: /<BillingHistory\b/.test(billingSrc),
});

const interviewSrc = readFileSync(resolve("src/pages/app/interviews/NewInterview.tsx"), "utf8");
log("H-SCH-002", "verify-script:prefill", "edit prefill guards", {
  hasRoundPrefilledRef: /roundPrefilledRef/.test(interviewSrc),
});

const historySrc = readFileSync(resolve("src/components/billing/BillingHistory.tsx"), "utf8");
log("H-BILL-006", "verify-script:history-src", "BillingHistory fulfilled handling", {
  treatsFulfilled: /status === "fulfilled"/.test(historySrc) || /fulfilled/.test(historySrc),
  hasAgentLog: /H-BILL-006/.test(historySrc),
});

const calendarSrc = readFileSync(resolve("src/hooks/useCalendarSync.ts"), "utf8");
log("H-SCH-001", "verify-script:calendar", "calendar 401 handling", {
  treats401AsDisconnected: /status === 401/.test(calendarSrc) && /setIsConnected\(false\)/.test(calendarSrc),
});

console.log("OK wrote", LOG);
