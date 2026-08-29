/** Shared stem key for skipping duplicate public bank inserts. */

export function questionStemKey(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function takeUniqueStemRows<T extends { question_text: string }>(
  rows: T[],
  existingKeys: Iterable<string>,
): { novel: T[]; skipped: number } {
  const seen = new Set(
    [...existingKeys].map((k) => questionStemKey(k)).filter(Boolean),
  );
  const novel: T[] = [];
  let skipped = 0;
  for (const row of rows) {
    const key = questionStemKey(row.question_text);
    if (!key || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    novel.push(row);
  }
  return { novel, skipped };
}
