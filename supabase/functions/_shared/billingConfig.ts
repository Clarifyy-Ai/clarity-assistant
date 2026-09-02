/**
 * Production billing configuration validation.
 * Never logs raw secret values — only names and validity flags.
 */

export type AppEnvironment = "development" | "staging" | "production";

export interface EnvCheckResult {
  name: string;
  present: boolean;
  formatValid: boolean;
  environmentCompatible: boolean;
  detail: string;
}

export interface BillingConfigReport {
  environment: AppEnvironment;
  ok: boolean;
  checks: EnvCheckResult[];
  errors: string[];
}

function detectEnvironment(): AppEnvironment {
  const raw = (
    Deno.env.get("APP_ENV") ??
    Deno.env.get("ENVIRONMENT") ??
    Deno.env.get("DENO_ENV") ??
    ""
  )
    .trim()
    .toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  return "development";
}

/** Example IDs from .env.example / sync script — never allow into the live catalog. */
const PLACEHOLDER_PRICE_ID_RE =
  /^price_(starter|pro|elite|enterprise|credits)(_\d+)?_(monthly|yearly)$/i;
const PLACEHOLDER_CREDITS_PACK_RE = /^price_credits_\d+$/i;

function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  const raw = value.trim();
  return (
    !v ||
    v.includes("changeme") ||
    v.includes("your_") ||
    v.includes("xxx") ||
    v.includes("placeholder") ||
    v === "test" ||
    v === "todo" ||
    PLACEHOLDER_PRICE_ID_RE.test(raw) ||
    PLACEHOLDER_CREDITS_PACK_RE.test(raw)
  );
}

function check(
  name: string,
  value: string | undefined,
  opts: {
    required: boolean;
    pattern?: RegExp;
    productionForbidsTestPrefix?: boolean;
    environment: AppEnvironment;
  },
): EnvCheckResult {
  const present = Boolean(value && value.trim().length > 0 && !isPlaceholder(value));
  let formatValid = present;
  let detail = present ? "present" : "missing_or_placeholder";
  let environmentCompatible = true;

  if (present && opts.pattern && !opts.pattern.test(value!.trim())) {
    formatValid = false;
    detail = "format_invalid";
  }

  if (
    present &&
    opts.productionForbidsTestPrefix &&
    opts.environment === "production"
  ) {
    const v = value!.trim();
    if (v.startsWith("sk_test") || v.startsWith("pk_test") || v.startsWith("price_test") || v.startsWith("rzp_test_")) {
      environmentCompatible = false;
      formatValid = false;
      detail = "test_mode_forbidden_in_production";
    }
  }

  if (!opts.required && !present) {
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

const STRIPE_PRICE_KEYS = [
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_ENTERPRISE_MONTHLY",
  "STRIPE_PRICE_ENTERPRISE_YEARLY",
  "STRIPE_PRICE_CREDITS_50",
  "STRIPE_PRICE_CREDITS_150",
  "STRIPE_PRICE_CREDITS_500",
] as const;

/**
 * Validate billing-related env for the current process.
 * Does not throw — callers decide fail-closed behavior.
 */
export function validateBillingConfig(options?: {
  requireStripe?: boolean;
  requireRazorpay?: boolean;
  requireRazorpayWebhook?: boolean;
}): BillingConfigReport {
  const environment = detectEnvironment();
  const requireRazorpay =
    options?.requireRazorpay ??
    Boolean(Deno.env.get("RAZORPAY_KEY_ID") || Deno.env.get("RAZORPAY_KEY_SECRET"));
  // Razorpay is the live checkout path. Stripe is optional leftover config.
  const requireStripe =
    options?.requireStripe ?? Boolean(Deno.env.get("STRIPE_SECRET_KEY"));
  const requireRazorpayWebhook =
    options?.requireRazorpayWebhook ??
    (requireRazorpay && environment === "production");

  const checks: EnvCheckResult[] = [];

  checks.push(
    check("STRIPE_SECRET_KEY", Deno.env.get("STRIPE_SECRET_KEY"), {
      required: requireStripe,
      pattern: /^sk_(live|test)_[A-Za-z0-9]+$/,
      productionForbidsTestPrefix: true,
      environment,
    }),
  );
  checks.push(
    check("STRIPE_WEBHOOK_SECRET", Deno.env.get("STRIPE_WEBHOOK_SECRET"), {
      required: requireStripe,
      pattern: /^whsec_[A-Za-z0-9]+$/,
      environment,
    }),
  );

  for (const key of STRIPE_PRICE_KEYS) {
    checks.push(
      check(key, Deno.env.get(key), {
        required: requireStripe && environment === "production",
        pattern: /^price_[A-Za-z0-9]+$/,
        productionForbidsTestPrefix: true,
        environment,
      }),
    );
  }

  checks.push(
    check("RAZORPAY_KEY_ID", Deno.env.get("RAZORPAY_KEY_ID"), {
      required: requireRazorpay,
      pattern: /^rzp_(live|test)_[A-Za-z0-9]+$/,
      productionForbidsTestPrefix: true,
      environment,
    }),
  );
  checks.push(
    check("RAZORPAY_KEY_SECRET", Deno.env.get("RAZORPAY_KEY_SECRET"), {
      required: requireRazorpay,
      environment,
    }),
  );
  checks.push(
    check("RAZORPAY_WEBHOOK_SECRET", Deno.env.get("RAZORPAY_WEBHOOK_SECRET"), {
      required: requireRazorpayWebhook,
      environment,
    }),
  );

  const publicUrl = Deno.env.get("PUBLIC_URL") ?? Deno.env.get("SITE_URL");
  checks.push(
    check("PUBLIC_URL", publicUrl, {
      required:
        environment === "production" && (requireStripe || requireRazorpay),
      pattern: /^https:\/\//,
      environment,
    }),
  );

  const errors: string[] = [];
  for (const c of checks) {
    if (!c.present && c.detail !== "optional_absent") {
      errors.push(`${c.name}: missing`);
    } else if (!c.formatValid) {
      errors.push(`${c.name}: ${c.detail}`);
    } else if (!c.environmentCompatible) {
      errors.push(`${c.name}: incompatible_with_${environment}`);
    }
  }

  return {
    environment,
    ok: errors.length === 0,
    checks,
    errors,
  };
}

/** Fail closed for billing Edge Functions in production. */
export function assertBillingConfigOrThrow(options?: {
  requireStripe?: boolean;
  requireRazorpay?: boolean;
  requireRazorpayWebhook?: boolean;
}): BillingConfigReport {
  const report = validateBillingConfig(options);
  if (!report.ok && report.environment === "production") {
    throw new Error(
      `Billing configuration invalid: ${report.errors.join("; ")}`,
    );
  }
  return report;
}

/** Safe summary for preflight scripts / admin diagnostics. */
export function billingConfigSummary(
  report: BillingConfigReport,
): Array<{
  name: string;
  present: boolean;
  formatValid: boolean;
  environmentCompatible: boolean;
}> {
  return report.checks.map((c) => ({
    name: c.name,
    present: c.present,
    formatValid: c.formatValid,
    environmentCompatible: c.environmentCompatible,
  }));
}
