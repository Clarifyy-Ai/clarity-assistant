import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type PublicPromoOffer = {
  code: string;
  discount_percent: number;
  bonus_credits: number;
  valid_until: string | null;
  description: string | null;
};

export type PublicPromoRow = PublicPromoOffer & {
  is_active: boolean;
  valid_from: string;
  max_redemptions: number | null;
  redemption_count: number;
};

function normalizePublicPromoOffer(raw: unknown): PublicPromoOffer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const code = String(row.code ?? "").trim().toUpperCase();
  if (code.length < 4) return null;
  return {
    code,
    discount_percent: Number(row.discount_percent ?? 0),
    bonus_credits: Number(row.bonus_credits ?? 0),
    valid_until: typeof row.valid_until === "string" ? row.valid_until : null,
    description: typeof row.description === "string" ? row.description : null,
  };
}

/** Mirrors list-public-promos Edge filtering for unit tests. */
export function filterPublicPromoOffers(
  rows: PublicPromoRow[],
  now: Date = new Date(),
): PublicPromoOffer[] {
  return rows
    .filter((row) => {
      if (!row.is_active) return false;
      if (row.valid_from && new Date(row.valid_from) > now) return false;
      if (row.valid_until && new Date(row.valid_until) <= now) return false;
      const used = row.redemption_count ?? 0;
      if (row.max_redemptions != null && used >= row.max_redemptions) return false;
      return row.code.trim().length >= 4;
    })
    .map(({ code, discount_percent, bonus_credits, valid_until, description }) => ({
      code: code.trim().toUpperCase(),
      discount_percent: Number(discount_percent ?? 0),
      bonus_credits: Number(bonus_credits ?? 0),
      valid_until,
      description,
    }));
}

export function formatPublicPromoHeadline(offer: PublicPromoOffer): string {
  const parts: string[] = [];
  if (offer.discount_percent > 0) {
    parts.push(`${offer.discount_percent}% off`);
  }
  if (offer.bonus_credits > 0) {
    parts.push(`+${offer.bonus_credits.toLocaleString()} bonus credits`);
  }
  if (parts.length === 0) return offer.code;
  return parts.join(" · ");
}

export function formatPublicPromoExpiry(validUntil: string | null): string | null {
  if (!validUntil) return null;
  const date = new Date(validUntil);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

let cachedOffers: PublicPromoOffer[] | null = null;
let loadPromise: Promise<PublicPromoOffer[]> | null = null;

export function resetPublicPromosForTests(): void {
  cachedOffers = null;
  loadPromise = null;
}

/** Last successfully loaded offers — safe for synchronous first paint (SPA revisits). */
export function getCachedPublicPromoOffers(): PublicPromoOffer[] | null {
  return cachedOffers;
}

async function loadPublicPromoOffersFromRpc(): Promise<PublicPromoOffer[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_public_promo_offers");
    if (error) return null;
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map(normalizePublicPromoOffer)
      .filter((row): row is PublicPromoOffer => row !== null);
  } catch {
    return null;
  }
}

async function loadPublicPromoOffersFromEdge(): Promise<PublicPromoOffer[] | null> {
  try {
    const data = await fetchEdgeJson<{ offers?: PublicPromoOffer[] }>("list-public-promos", {});
    if (!Array.isArray(data?.offers)) return null;
    return data.offers
      .map(normalizePublicPromoOffer)
      .filter((row): row is PublicPromoOffer => row !== null);
  } catch {
    return null;
  }
}

export async function loadPublicPromoOffers(opts?: { force?: boolean }): Promise<PublicPromoOffer[]> {
  if (!opts?.force && cachedOffers !== null) return cachedOffers;

  if (opts?.force) {
    loadPromise = null;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const fromRpc = await loadPublicPromoOffersFromRpc();
      if (fromRpc !== null) {
        cachedOffers = fromRpc;
        return fromRpc;
      }

      const fromEdge = await loadPublicPromoOffersFromEdge();
      if (fromEdge !== null) {
        cachedOffers = fromEdge;
        return fromEdge;
      }

      // Do not cache failures — allow retry on next page view.
      return [];
    })();
  }

  return loadPromise;
}
