/**
 * Canonical company identity for Edge Functions.
 *
 * Deno cannot resolve the app's `@/` alias, so this mirrors
 * `src/lib/company/normalizeCompanyName.ts` and SQL
 * `public.normalize_company_name(text)`. Keep all three in sync.
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
  const base = `company-research:${input.userId}:${input.normalizedCompany}`;
  if (!input.force) return base;
  // A forced refresh is a new spend, but rapid double-clicks inside the same
  // minute must still collapse into one charge.
  const bucket = (input.now ?? new Date()).toISOString().slice(0, 16);
  return `${base}:force:${bucket}`;
}
