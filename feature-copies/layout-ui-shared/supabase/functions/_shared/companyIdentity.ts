/**
 * Canonical company identity for Edge Functions.
 *
 * Deno cannot resolve the app's `@/` alias, so this mirrors
 * `src/lib/company/normalizeCompanyName.ts` and SQL
 * `public.normalize_company_name(text)`. Keep all three in sync.
 */

/** True when input looks like a URL or bare hostname (not free-text company name). */
function looksLikeUrlOrHost(input: string): boolean {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^www\./i.test(trimmed)) return true;
  if (
    /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/.*)?$/i.test(trimmed) &&
    !trimmed.includes(" ")
  ) {
    return true;
  }
  return false;
}

export function normalizeCompanyName(name: string | null | undefined): string {
  let s = String(name ?? "");
  if (looksLikeUrlOrHost(s)) {
    s = s.trim().toLowerCase();
    s = s.replace(/^https?:\/\//i, "");
    s = s.replace(/^www\./i, "");
    s = s.replace(/\/+$/, "");
    const slash = s.indexOf("/");
    if (slash > 0) s = s.slice(0, slash);
  }
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Stable idempotency key for a company brief request.
 * Callers may override it with an `x-idempotency-key` header.
 */
export function companyResearchIdempotencyKey(input: {
  userId: string;
  normalizedCompany: string;
  force?: boolean;
  now?: Date;
}): string {
  const slug = input.normalizedCompany.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._:-]/g, "_");
  const base = `company-research:${input.userId}:${slug}`;
  if (!input.force) return base;
  // A forced refresh is a new spend, but rapid double-clicks inside the same
  // minute must still collapse into one charge.
  const bucket = (input.now ?? new Date()).toISOString().slice(0, 16);
  return `${base}:force:${bucket}`;
}
