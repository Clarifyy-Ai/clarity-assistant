/** Canonical Session History types (matches get_session_history RPC). */

import { isAssessmentRoleSlug } from "@/lib/assessments/taxonomy";
import { roleLabel } from "@/lib/assessments/roleNormalize";

export const SESSION_HISTORY_TYPES = [
  "practice_coach",
  "mock_interview",
  "government_exam",
  "assessment",
  "practice_workspace",
  "coding_assessment",
  "other_practice",
  "live_copilot",
] as const;

export type SessionHistoryCanonicalType = (typeof SESSION_HISTORY_TYPES)[number];

export const SESSION_HISTORY_STATUSES = [
  "draft",
  "scheduled",
  "starting",
  "active",
  "paused",
  "processing",
  "completed",
  "incomplete",
  "submitted",
  "expired",
  "cancelled",
  "failed",
  "evaluation_pending",
  "evaluation_failed",
] as const;

export type SessionHistoryStatus = (typeof SESSION_HISTORY_STATUSES)[number];

export type SessionHistorySort =
  | "newest"
  | "oldest"
  | "highest_score"
  | "lowest_score"
  | "longest"
  | "shortest";

export type SessionHistoryItem = {
  sessionId: string;
  sourceId: string;
  sourceKind: "interview" | "mock_test" | "practice_workspace" | "coding_submission" | string;
  userId: string;
  sessionType: SessionHistoryCanonicalType | string;
  sessionSubtype?: string | null;
  title: string;
  role?: string | null;
  company?: string | null;
  examName?: string | null;
  assessmentName?: string | null;
  status: SessionHistoryStatus | string;
  sourceStatus?: string | null;
  startedAt?: string | null;
  lastActivityAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  answeredCount?: number | null;
  totalQuestionCount?: number | null;
  score?: number | null;
  scoreMaximum?: number | null;
  scoreUnit?: "percent" | "marks" | "tests" | string | null;
  resultLabel?: string | null;
  debriefStatus?: string | null;
  debriefId?: string | null;
  detailRoute: string;
  sourceRoute?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Only `sessions` rows are deleted via sessionsDB.delete (same scope as legacy list). */
export function sessionHistoryItemIsDeletable(
  item: Pick<SessionHistoryItem, "sourceKind" | "sessionId" | "sourceId">,
): boolean {
  if (item.sourceKind !== "interview") return false;
  const id = (item.sessionId || item.sourceId || "").trim();
  return id.length > 0;
}

export type SessionHistoryResponse =
  | {
      ok: true;
      items: SessionHistoryItem[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
      detail?: string;
    };

export type SessionHistoryQuery = {
  types?: string[];
  statuses?: string[];
  search?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  scoreState?: "all" | "scored" | "not_scored";
  debriefState?: "all" | "available" | "processing" | "not_eligible" | "failed" | "not_requested";
  sort?: SessionHistorySort;
  cursor?: string | null;
  pageSize?: number;
};

export function sessionHistoryTypeLabel(item: Pick<SessionHistoryItem, "sessionType" | "sessionSubtype">): string {
  if (item.sessionSubtype === "live_copilot" || item.sessionType === "live_copilot") {
    return "Live Copilot";
  }
  switch (item.sessionType) {
    case "practice_coach":
      return "Practice Coach";
    case "mock_interview":
      return "Mock Interview";
    case "government_exam":
      return "Government Exam";
    case "assessment":
      return "Assessment";
    case "practice_workspace":
      return "Practice Workspace";
    case "coding_assessment":
      return "Coding Assessment";
    default:
      return "Other Practice";
  }
}

/** Display score truthfully — never invent zero. */
export function sessionHistoryScoreDisplay(item: SessionHistoryItem): string {
  if (item.resultLabel) return item.resultLabel;
  if (item.score == null) return "Not scored";
  if (item.scoreUnit === "marks" && item.scoreMaximum != null) {
    return `${Math.round(item.score)}/${Math.round(item.scoreMaximum)}`;
  }
  if (item.scoreUnit === "tests") {
    return `${item.answeredCount ?? "—"}/${item.totalQuestionCount ?? "—"} tests`;
  }
  return `${Math.round(item.score)}%`;
}

/** Humanize role_slug for assessment rows; leave interview roles as-is. */
export function sessionHistoryRoleDisplay(
  item: Pick<SessionHistoryItem, "sessionType" | "role">,
): string | null {
  const raw = item.role?.trim();
  if (!raw) return null;
  if (item.sessionType === "assessment" && isAssessmentRoleSlug(raw)) {
    return roleLabel(raw);
  }
  return raw;
}

/**
 * Secondary line under the title: role (+ objective for assessments), exam/assessment name, company.
 * Assessment objective may arrive as sessionSubtype from get_session_history (config.assessment_objective).
 */
export function sessionHistoryContextLine(item: SessionHistoryItem): string {
  const role = sessionHistoryRoleDisplay(item);
  const objective =
    item.sessionType === "assessment" && item.sessionSubtype
      ? item.sessionSubtype.replace(/_/g, " ")
      : null;
  const parts = [
    role || item.examName || item.assessmentName,
    objective,
    item.company,
  ].filter(Boolean) as string[];
  return parts.join(" · ") || sessionHistoryTypeLabel(item);
}
