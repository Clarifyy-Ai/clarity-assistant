/** Drop null/blank strings from scorecard strength & improvement lists. */
export function normalizeFeedbackItems(items: string[] | null | undefined): string[] {
  return (items ?? [])
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter(Boolean);
}
