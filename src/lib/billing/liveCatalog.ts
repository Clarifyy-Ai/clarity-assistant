import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type CatalogPaise = {
  pro_monthly: number;
  enterprise_monthly: number;
  credits_50: number;
  credits_150: number;
  credits_500: number;
};

/** Fallback only until billing-catalog Edge returns billing_settings. */
export const CATALOG_PAISE_FALLBACK: CatalogPaise = {
  pro_monthly: 249_900,
  enterprise_monthly: 679_900,
  credits_50: 69_900,
  credits_150: 189_900,
  credits_500: 599_900,
};

let live: CatalogPaise | null = null;
let hydratePromise: Promise<void> | null = null;
/** null = unknown (fetch failed or field missing); never invent "configured". */
let paymentsConfigured: boolean | null = null;

export function getLiveCatalogPaise(): CatalogPaise {
  return live ?? { ...CATALOG_PAISE_FALLBACK };
}

export function applyLiveCatalog(next: Partial<CatalogPaise>): CatalogPaise {
  live = { ...CATALOG_PAISE_FALLBACK, ...next };
  return live;
}

/** Razorpay checkoutConfigured from billing-catalog; null when unknown. */
export function getCatalogPaymentsConfigured(): boolean | null {
  return paymentsConfigured;
}

export function applyCatalogPaymentsConfigured(value: boolean | null): void {
  paymentsConfigured = value;
}

/** Test helper — resets module cache between unit tests. */
export function resetLiveCatalogForTests(): void {
  live = null;
  hydratePromise = null;
  paymentsConfigured = null;
}

export async function hydrateBillingCatalog(opts?: {
  /** Re-fetch even when prices/config are cached (Settings / UpgradeModal). */
  force?: boolean;
}): Promise<CatalogPaise> {
  if (!opts?.force && live !== null && paymentsConfigured !== null) return live;

  if (opts?.force) {
    if (hydratePromise) {
      try {
        await hydratePromise;
      } catch {
        /* ignore prior failure */
      }
    }
    hydratePromise = null;
  }

  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        // Always send JSON `{}` — empty POST + Content-Type application/json is often 400.
        const data = await fetchEdgeJson<{
          paise?: Partial<CatalogPaise>;
          payments_configured?: boolean;
        }>("billing-catalog", {});
        if (data?.paise) applyLiveCatalog(data.paise);
        else if (live === null) applyLiveCatalog({});
        if (typeof data?.payments_configured === "boolean") {
          paymentsConfigured = data.payments_configured;
        }
      } catch {
        // Keep hardcoded fallback until Edge/secrets exist; config stays unknown.
        if (live === null) applyLiveCatalog({});
      }
    })();
  }
  await hydratePromise;
  return getLiveCatalogPaise();
}
