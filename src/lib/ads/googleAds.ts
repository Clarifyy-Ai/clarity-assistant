import { ENV, IS_PRODUCTION } from "@/lib/env";
import { isElectronApp } from "@/lib/platform/isElectron";
import { hasMarketingConsent } from "@/lib/privacy/cookieConsent";
import { logger } from "@/lib/logger";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GTAG_ORIGIN = "https://www.googletagmanager.com/gtag/js";

function adsId(): string {
  return ENV.GOOGLE_ADS_ID.trim();
}

export function isGoogleAdsConfigured(): boolean {
  const id = adsId();
  return /^AW-\d+$/i.test(id);
}

function sendTo(label: string): string | null {
  const id = adsId();
  const trimmed = label.trim();
  if (!id || !trimmed) return null;
  return `${id}/${trimmed}`;
}

function ensureGtag(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag === "function") return;
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
}

let loaded = false;

/** Load gtag.js only after marketing consent. No-op in Electron and when Ads ID is unset. */
export function initGoogleAds(): void {
  if (loaded) return;
  if (typeof window === "undefined") return;
  if (isElectronApp()) return;
  if (!isGoogleAdsConfigured()) return;
  if (!hasMarketingConsent()) return;

  const id = adsId();
  ensureGtag();

  if (!document.querySelector(`script[src^="${GTAG_ORIGIN}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `${GTAG_ORIGIN}?id=${encodeURIComponent(id)}`;
    script.dataset.clarityAds = "gtag";
    document.head.appendChild(script);
  }

  window.gtag?.("js", new Date());
  window.gtag?.("config", id, {
    anonymize_ip: true,
    allow_ad_personalization_signals: IS_PRODUCTION,
  });
  const gaId = ENV.GA_MEASUREMENT_ID.trim();
  if (/^G-[A-Z0-9]+$/i.test(gaId)) {
    window.gtag?.("config", gaId, { anonymize_ip: true });
  }
  loaded = true;
}

export function trackGoogleAdsConversion(opts: {
  label: string;
  value?: number;
  currency?: string;
  transactionId?: string;
}): void {
  if (!isGoogleAdsConfigured() || !hasMarketingConsent()) return;
  initGoogleAds();
  const target = sendTo(opts.label);
  if (!target || typeof window.gtag !== "function") return;

  const payload: Record<string, unknown> = { send_to: target };
  if (typeof opts.value === "number" && Number.isFinite(opts.value) && opts.value >= 0) {
    payload.value = opts.value;
    payload.currency = opts.currency ?? "INR";
  }
  if (opts.transactionId) payload.transaction_id = opts.transactionId;

  try {
    window.gtag("event", "conversion", payload);
  } catch (err) {
    logger.warn("google_ads.conversion_failed", {
      reason: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }
}

export function trackGoogleAdsSignup(): void {
  const label = ENV.GOOGLE_ADS_SIGNUP_LABEL.trim();
  if (!label) return;
  trackGoogleAdsConversion({ label });
}

export function trackGoogleAdsPurchase(opts: {
  amountPaise: number;
  currency?: string;
  transactionId?: string;
}): void {
  const label = ENV.GOOGLE_ADS_PURCHASE_LABEL.trim();
  if (!label) return;
  const rupees = Math.round(opts.amountPaise) / 100;
  trackGoogleAdsConversion({
    label,
    value: rupees,
    currency: opts.currency ?? "INR",
    transactionId: opts.transactionId,
  });
}
