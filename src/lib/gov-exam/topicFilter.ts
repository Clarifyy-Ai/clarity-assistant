/**
 * Topic / subject matching for Custom Practice Sets.
 * Bank rows match when normalized subject OR topic is in the requested set.
 */

export function normalizeTopicToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeTopicList(topics: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of topics) {
    const n = normalizeTopicToken(String(raw ?? ""));
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function questionMatchesTopics(
  question: { subject?: string | null; topic?: string | null },
  topics: string[],
): boolean {
  const wanted = new Set(normalizeTopicList(topics));
  if (wanted.size === 0) return false;
  const subject = normalizeTopicToken(String(question.subject ?? ""));
  const topic = normalizeTopicToken(String(question.topic ?? ""));
  return (subject !== "" && wanted.has(subject)) || (topic !== "" && wanted.has(topic));
}

export function filterQuestionsByTopics<
  T extends { subject?: string | null; topic?: string | null },
>(rows: T[], topics: string[]): T[] {
  return rows.filter((row) => questionMatchesTopics(row, topics));
}

/** Flatten syllabus topics_json sections into selectable topic strings. */
export function flattenSyllabusTopicLabels(topicsJson: unknown): string[] {
  if (!Array.isArray(topicsJson)) return [];
  const labels: string[] = [];
  for (const entry of topicsJson) {
    if (typeof entry === "string") {
      labels.push(entry);
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.topic === "string") labels.push(rec.topic);
    if (typeof rec.name === "string") labels.push(rec.name);
    if (Array.isArray(rec.topics)) {
      for (const t of rec.topics) {
        if (typeof t === "string") labels.push(t);
      }
    }
  }
  // Preserve display form (underscores → spaces) but keep unique by normalized key
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const n = normalizeTopicToken(label);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(label.replace(/[_-]+/g, " "));
  }
  return out;
}
