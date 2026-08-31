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

export function getLiveCatalogPaise(): CatalogPaise {
  return live ?? { ...CATALOG_PAISE_FALLBACK };
}

export function applyLiveCatalog(next: Partial<CatalogPaise>): CatalogPaise {
  live = { ...CATALOG_PAISE_FALLBACK, ...next };
  return live;
}

export async function hydrateBillingCatalog(): Promise<CatalogPaise> {
  if (live) return live;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const data = await fetchEdgeJson<{
          paise?: Partial<CatalogPaise>;
        }>("billing-catalog");
        if (data?.paise) applyLiveCatalog(data.paise);
      } catch {
        // Keep hardcoded fallback until Edge/secrets exist.
      }
    })();
  }
  await hydratePromise;
  return getLiveCatalogPaise();
}
