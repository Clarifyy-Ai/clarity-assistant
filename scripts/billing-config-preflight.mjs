#!/usr/bin/env node
/**
 * Safe billing configuration preflight.
 * Reports ONLY: variable name, present/missing, format valid/invalid,
 * environment compatibility. Never prints raw secret values.
 *
 * Usage: node scripts/billing-config-preflight.mjs
 * Exit 0 = report printed (missing vars do not fail in development).
 * Exit 2 = production APP_ENV with invalid/missing required vars.
 */

const APP_ENV = (process.env.APP_ENV || process.env.ENVIRONMENT || "development")
  .trim()
  .toLowerCase();
const isProd = APP_ENV === "production" || APP_ENV === "prod";

function isPlaceholder(value) {
  const v = String(value || "").trim().toLowerCase();
  return (
    !v ||
    v.includes("changeme") ||
    v.includes("your_") ||
    v.includes("placeholder") ||
    v === "test" ||
    v === "todo"
  );
}

function check(name, value, { required, pattern, forbidTestPrefix }) {
  const present = Boolean(value && !isPlaceholder(value));
  let formatValid = present;
  let environmentCompatible = true;
  let detail = present ? "present" : "missing_or_placeholder";

  if (present && pattern && !pattern.test(String(value).trim())) {
    formatValid = false;
    detail = "format_invalid";
  }

  if (present && forbidTestPrefix && isProd) {
    const v = String(value).trim();
    if (v.startsWith("sk_test") || v.startsWith("pk_test") || v.startsWith("price_test") || v.startsWith("rzp_test_")) {
      environmentCompatible = false;
      formatValid = false;
      detail = "test_mode_forbidden_in_production";
    }
  }

  if (!required && !present) {
    return {
      name,
      present: false,
      formatValid: true,
      environmentCompatible: true,
      detail: "optional_absent",
    };
  }

  return { name, present, formatValid, environmentCompatible, detail };
}

const requireStripe = Boolean(process.env.STRIPE_SECRET_KEY);
const requireRazorpay =
  isProd ||
  Boolean(process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_SECRET);

const checks = [
  check("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY, {
    required: requireStripe,
    pattern: /^sk_(live|test)_[A-Za-z0-9]+$/,
    forbidTestPrefix: true,
  }),
  check("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET, {
    required: requireStripe,
    pattern: /^whsec_[A-Za-z0-9]+$/,
  }),
  ...[
    "STRIPE_PRICE_PRO_MONTHLY",
    "STRIPE_PRICE_PRO_YEARLY",
    "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    "STRIPE_PRICE_ENTERPRISE_YEARLY",
    "STRIPE_PRICE_CREDITS_50",
    "STRIPE_PRICE_CREDITS_150",
    "STRIPE_PRICE_CREDITS_500",
  ].map((name) =>
    check(name, process.env[name], {
      required: requireStripe && isProd,
      pattern: /^price_[A-Za-z0-9]+$/,
      forbidTestPrefix: true,
    }),
  ),
  check("RAZORPAY_KEY_ID", process.env.RAZORPAY_KEY_ID, {
    required: requireRazorpay,
    pattern: /^rzp_(live|test)_[A-Za-z0-9]+$/,
    forbidTestPrefix: true,
  }),
  check("RAZORPAY_KEY_SECRET", process.env.RAZORPAY_KEY_SECRET, {
    required: requireRazorpay,
  }),
  check("RAZORPAY_WEBHOOK_SECRET", process.env.RAZORPAY_WEBHOOK_SECRET, {
    required: requireRazorpay && isProd,
  }),
  check("PUBLIC_URL", process.env.PUBLIC_URL || process.env.SITE_URL, {
    required: isProd && (requireStripe || requireRazorpay),
    pattern: /^https:\/\//,
  }),
];

console.log(JSON.stringify({ environment: APP_ENV, checks }, null, 2));

const errors = checks.filter(
  (c) =>
    (c.detail !== "optional_absent" && !c.present) ||
    !c.formatValid ||
    !c.environmentCompatible,
);

if (isProd && errors.length > 0) {
  console.error(
    JSON.stringify({
      ok: false,
      error_count: errors.length,
      names: errors.map((e) => e.name),
    }),
  );
  process.exit(2);
}

process.exit(0);
