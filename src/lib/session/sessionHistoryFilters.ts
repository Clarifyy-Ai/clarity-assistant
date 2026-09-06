/** Session History filters + URL sync for the authoritative timeline. */

import type {
  SessionHistoryCanonicalType,
  SessionHistoryQuery,
  SessionHistorySort,
  SessionHistoryStatus,
} from "@/lib/session/sessionHistoryTypes";

/** @deprecated Prefer SessionHistoryCanonicalType — kept for older tests. */
export type SessionHistoryTypeFilter =
  | "all"
  | "live"
  | "mock"
  | "practice"
  | SessionHistoryCanonicalType
  | "live_copilot";

export const HISTORY_TYPE_CHIPS: { id: string; label: string; description?: string }[] = [
  { id: "all", label: "All" },
  {
    id: "live_copilot",
    label: "Live Copilot (Live)",
    description: "Live coaching sessions, including the desktop overlay.",
  },
  {
    id: "practice_coach",
    label: "Practice Coach (Practice)",
    description: "Rehearsal, warm-up, and other practice coaching sessions.",
  },
  { id: "mock_interview", label: "Mock Interview" },
  { id: "government_exam", label: "Government Exam" },
  { id: "assessment", label: "Assessment" },
  { id: "practice_workspace", label: "Practice Workspace" },
  { id: "coding_assessment", label: "Coding Assessment" },
];

export const HISTORY_STATUS_CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: "active", label: "In Progress" },
  { id: "processing", label: "Processing" },
  { id: "completed", label: "Completed" },
  { id: "incomplete", label: "Incomplete" },
  { id: "submitted", label: "Submitted" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
];

export const HISTORY_SORT_OPTIONS: { id: SessionHistorySort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "highest_score", label: "Highest score" },
  { id: "lowest_score", label: "Lowest score" },
  { id: "longest", label: "Longest duration" },
  { id: "shortest", label: "Shortest duration" },
];

export function typesForChip(chip: string): string[] | undefined {
  if (!chip || chip === "all") return undefined;
  if (chip === "live" || chip === "live_copilot") return ["live_copilot"];
  if (chip === "practice") return ["practice_coach"];
  if (chip === "mock") return ["mock_interview"];
  return [chip];
}

/** Legacy helper used by older unit tests against DB session.type. */
export function sessionMatchesTypeFilter(
  sessionType: string | null | undefined,
  filter: SessionHistoryTypeFilter,
): boolean {
  if (filter === "all") return true;
  const type = String(sessionType ?? "").toLowerCase();
  if (filter === "practice" || filter === "practice_coach") {
    return type === "practice" || type === "rehearsal" || type === "warmup" || type === "practice_coach";
  }
  if (filter === "live" || filter === "live_copilot") {
    return type === "live" || type === "live_copilot" || type === "rehearsal";
  }
  if (filter === "mock" || filter === "mock_interview") {
    return type === "mock" || type === "mock_interview";
  }
  return type === filter;
}

export function sessionTypeLabel(session: {
  type?: string | null;
  source_type?: string | null;
  sessionType?: string | null;
  sessionSubtype?: string | null;
}): string {
  if (session.source_type === "answer_bank") return "Answer Bank practice";
  if (session.sessionSubtype === "live_copilot" || session.sessionType === "live_copilot") {
    return "Live Copilot";
  }
  if (session.sessionType === "practice_coach") return "Practice Coach";
  if (session.sessionType === "mock_interview") return "Mock Interview";
  if (session.sessionType === "government_exam") return "Government Exam";
  if (session.sessionType === "assessment") return "Assessment";
  if (session.sessionType === "practice_workspace") return "Practice Workspace";
  if (session.sessionType === "coding_assessment") return "Coding Assessment";
  const type = String(session.type ?? "").toLowerCase();
  if (type === "live") return "Live Copilot";
  if (type === "rehearsal" || type === "practice" || type === "warmup") return "Practice Coach";
  if (type === "mock") return "Mock Interview";
  return session.type ?? "practice";
}

export function isCompletedSessionStatus(status: string | null | undefined): boolean {
  return status === "completed";
}

export function parseHistorySearchParams(params: URLSearchParams): SessionHistoryQuery & {
  typeChip: string;
  statusChip: string;
} {
  const typeChip = params.get("type") || "all";
  const statusChip = params.get("status") || "all";
  const sort = (params.get("sort") as SessionHistorySort) || "newest";
  const scoreState = (params.get("score") as SessionHistoryQuery["scoreState"]) || "all";
  const debriefState = (params.get("debrief") as SessionHistoryQuery["debriefState"]) || "all";
  return {
    typeChip,
    statusChip,
    types: typesForChip(typeChip),
    statuses: statusChip === "all" ? undefined : [statusChip as SessionHistoryStatus],
    search: params.get("q") || undefined,
    dateFrom: params.get("from"),
    dateTo: params.get("to"),
    scoreState,
    debriefState,
    sort: HISTORY_SORT_OPTIONS.some((o) => o.id === sort) ? sort : "newest",
    cursor: params.get("cursor"),
    pageSize: 20,
  };
}

export function writeHistorySearchParams(
  current: URLSearchParams,
  next: {
    typeChip?: string;
    statusChip?: string;
    q?: string;
    sort?: string;
    score?: string;
    debrief?: string;
    from?: string | null;
    to?: string | null;
    cursor?: string | null;
  },
): URLSearchParams {
  const sp = new URLSearchParams(current);
  const setOrDelete = (key: string, value: string | null | undefined, blank = "all") => {
    if (!value || value === blank) sp.delete(key);
    else sp.set(key, value);
  };
  if (next.typeChip !== undefined) setOrDelete("type", next.typeChip);
  if (next.statusChip !== undefined) setOrDelete("status", next.statusChip);
  if (next.q !== undefined) {
    if (!next.q.trim()) sp.delete("q");
    else sp.set("q", next.q.trim());
  }
  if (next.sort !== undefined) setOrDelete("sort", next.sort, "newest");
  if (next.score !== undefined) setOrDelete("score", next.score);
  if (next.debrief !== undefined) setOrDelete("debrief", next.debrief);
  if (next.from !== undefined) {
    if (!next.from) sp.delete("from");
    else sp.set("from", next.from);
  }
  if (next.to !== undefined) {
    if (!next.to) sp.delete("to");
    else sp.set("to", next.to);
  }
  if (next.cursor !== undefined) {
    if (!next.cursor) sp.delete("cursor");
    else sp.set("cursor", next.cursor);
  }
  return sp;
}
