/** Session History type chips. DB stores Practice Coach as `rehearsal`. */

export type SessionHistoryTypeFilter = "all" | "live" | "mock" | "practice";

export function sessionMatchesTypeFilter(
  sessionType: string | null | undefined,
  filter: SessionHistoryTypeFilter,
): boolean {
  if (filter === "all") return true;
  const type = String(sessionType ?? "").toLowerCase();
  if (filter === "practice") {
    return type === "practice" || type === "rehearsal" || type === "warmup";
  }
  if (filter === "live") {
    return type === "live";
  }
  return type === filter;
}

export function sessionTypeLabel(session: {
  type?: string | null;
  source_type?: string | null;
  tags?: string[] | null;
}): string {
  if (session.source_type === "answer_bank") return "Answer Bank practice";
  const type = String(session.type ?? "").toLowerCase();
  if (type === "rehearsal" || type === "practice" || type === "warmup") return "practice";
  return session.type ?? "practice";
}

export function isCompletedSessionStatus(status: string | null | undefined): boolean {
  return status === "completed";
}
