/** Derive a URL-safe slug from a help article question. */
export function slugifyHelpQuestion(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function isValidHelpSlug(slug: string): boolean {
  const trimmed = slug.trim().toLowerCase();
  return Boolean(trimmed) && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(trimmed);
}
