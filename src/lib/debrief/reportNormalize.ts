/** Safe keyword / series extraction for debrief reports (never call methods on objects). */

export function keywordToString(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t && t !== "[object Object]" ? t : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  for (const key of ["keyword", "term", "text", "name", "label"]) {
    const inner = row[key];
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }
  return null;
}

export function normalizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = keywordToString(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export type ChangeTrackItem = {
  label: string;
  from: string | null;
  to: string | null;
};

/** Normalize report change-tracking payloads that may be objects or strings. */
export function normalizeChangeTracking(value: unknown): ChangeTrackItem[] {
  if (!Array.isArray(value)) return [];
  const items: ChangeTrackItem[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) items.push({ label: t, from: null, to: null });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label =
      keywordToString(row.label) ??
      keywordToString(row.field) ??
      keywordToString(row.path) ??
      keywordToString(row.name);
    if (!label) continue;
    items.push({
      label,
      from: typeof row.from === "string" ? row.from : typeof row.before === "string" ? row.before : null,
      to: typeof row.to === "string" ? row.to : typeof row.after === "string" ? row.after : null,
    });
  }
  return items;
}
