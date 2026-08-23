/**
 * Canonical company identity shared by the client cache lookup and the
 * `company_research.company_name_normalized` column.
 *
 * Must stay behaviourally identical to:
 * - SQL   `public.normalize_company_name(text)`
 * - Deno  `supabase/functions/_shared/companyIdentity.ts`
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when a company name carries no identity after normalization. */
export function isBlankCompanyName(name: string | null | undefined): boolean {
  return normalizeCompanyName(name).length === 0;
}
