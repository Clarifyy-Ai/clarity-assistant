/**
 * Topic / subject matching for Custom Practice Sets (edge copy of src/lib/gov-exam/topicFilter.ts).
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
