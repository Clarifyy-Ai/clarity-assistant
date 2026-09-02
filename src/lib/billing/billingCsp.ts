/**
 * Razorpay checkout CSP requirements for the web shell (index.html meta tag).
 * Checkout.js loads risk-detection from cdn.razorpay.com — blocking it breaks
 * payments/validate/account and surfaces Razorpay's generic "Uh oh!" modal.
 */

export const RAZORPAY_CSP_SCRIPT_HOSTS = [
  "https://checkout.razorpay.com",
  "https://cdn.razorpay.com",
  "https://*.razorpay.com",
] as const;

export const RAZORPAY_CSP_CONNECT_HOSTS = [
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
  "https://checkout.razorpay.com",
  "https://cdn.razorpay.com",
  "https://*.razorpay.com",
] as const;

export const RAZORPAY_CSP_FRAME_HOSTS = [
  "https://api.razorpay.com",
  "https://checkout.razorpay.com",
  "https://cdn.razorpay.com",
  "https://*.razorpay.com",
] as const;

export const RAZORPAY_RISK_DETECTION_PATH =
  "cdn.razorpay.com/static/cx/razorpay-risk-detection/bundle.js";

/** Assert index.html (or deployed HTML) allows Razorpay checkout scripts. */
export function assertBillingCspAllowsRazorpay(html: string): string[] {
  const missing: string[] = [];
  const cspMatch = html.match(
    /content-security-policy[\s\S]*?content="([\s\S]*?)"/i,
  );
  const csp = (cspMatch?.[1] ?? html).replace(/\s+/g, " ");

  if (!csp.includes("script-src")) {
    missing.push("script-src directive");
    return missing;
  }

  for (const host of RAZORPAY_CSP_SCRIPT_HOSTS) {
    if (!csp.includes(host)) {
      missing.push(`script-src ${host}`);
    }
  }

  if (!csp.includes(RAZORPAY_RISK_DETECTION_PATH) && !csp.includes("*.razorpay.com")) {
    missing.push(`script-src must allow ${RAZORPAY_RISK_DETECTION_PATH} (via *.razorpay.com or cdn host)`);
  }

  for (const host of RAZORPAY_CSP_CONNECT_HOSTS) {
    if (!csp.includes(host)) {
      missing.push(`connect-src ${host}`);
    }
  }

  return missing;
}
