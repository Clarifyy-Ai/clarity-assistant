/** URL slug for `/app/companies/:id` routes (hyphenated lowercase). */
export function companySlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export function companyProfilePath(name: string): string {
  const slug = companySlug(name);
  return `/app/companies/${slug}?name=${encodeURIComponent(name.trim())}`;
}
