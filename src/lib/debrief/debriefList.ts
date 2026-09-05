/**
 * Pure helpers for Debriefs list: merge saved debriefs with completed
 * sessions that still need generation, plus in-flight jobs.
 */

import {
  DEBRIEF_SESSION_DB_TYPES,
  type DebriefSessionDbType,
} from "@/lib/debrief/debriefSessionTypes";

export { DEBRIEF_SESSION_DB_TYPES, type DebriefSessionDbType };

export type DebriefListDebrief = {
  id: string;
  created_at: string;
  overall_grade: string | null;
  priority_focus: string | null;
  session_id: string | null;
};

export type DebriefListSession = {
  id: string;
  type: string | null;
  title: string | null;
  overall_score: number | null;
  created_at: string;
  questions_asked?: number | null;
  status?: string | null;
  /** True when session_answers exist (matches Edge generate-debrief). */
  hasAnswers?: boolean | null;
  /** True when session_transcripts exist. */
  hasTranscript?: boolean | null;
};

export type DebriefListProcessingJob = {
  jobId: string;
  sessionId: string;
  status: "queued" | "processing";
  updatedAt: string;
  createdAt?: string | null;
  progressStage?: string | null;
};

export type DebriefListFailedJob = {
  jobId: string;
  sessionId: string;
  updatedAt: string;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type DebriefListItem =
  | {
      kind: "debrief";
      id: string;
      sortAt: string;
      debrief: DebriefListDebrief;
      session: DebriefListSession | null;
    }
  | {
      kind: "pending";
      id: string;
      sortAt: string;
      session: DebriefListSession;
    }
  | {
      kind: "processing";
      id: string;
      sortAt: string;
      job: DebriefListProcessingJob;
      session: DebriefListSession | null;
    }
  | {
      kind: "failed";
      id: string;
      sortAt: string;
      job: DebriefListFailedJob;
      session: DebriefListSession | null;
    };

/**
 * Client-side eligibility — includes UI alias `practice` (maps to rehearsal/warmup in DB).
 * Do not pass to PostgREST `.in("type", …)`; use DEBRIEF_SESSION_DB_TYPES instead.
 */
export const DEBRIEF_ELIGIBLE_SESSION_TYPES = [
  ...DEBRIEF_SESSION_DB_TYPES,
  "practice",
] as const;

const INTERVIEW_SESSION_TYPES = new Set<string>(DEBRIEF_ELIGIBLE_SESSION_TYPES);

/**
 * Session has content worth debriefing — aligned with Edge NOT_SCORED:
 * questions_asked, overall_score, answers, or transcript.
 */
export function isDebriefEligibleSession(session: {
  questions_asked?: number | null;
  overall_score?: number | null;
  status?: string | null;
  type?: string | null;
  hasAnswers?: boolean | null;
  hasTranscript?: boolean | null;
}): boolean {
  if (session.status != null && session.status !== "completed") return false;
  if (session.type != null && !INTERVIEW_SESSION_TYPES.has(session.type)) {
    return false;
  }
  const asked = session.questions_asked ?? 0;
  return (
    asked > 0 ||
    session.overall_score != null ||
    Boolean(session.hasAnswers) ||
    Boolean(session.hasTranscript)
  );
}

/** Completed sessions whose ids are not already covered by a debrief row. */
export function filterPendingDebriefSessions(
  sessions: DebriefListSession[],
  debriefSessionIds: Iterable<string | null | undefined>,
): DebriefListSession[] {
  const covered = new Set(
    [...debriefSessionIds].filter((id): id is string => Boolean(id)),
  );
  return sessions.filter(
    (s) => isDebriefEligibleSession(s) && !covered.has(s.id),
  );
}

/** Attach answer/transcript flags onto session rows for eligibility. */
export function annotateSessionsWithContentFlags<
  T extends { id: string },
>(
  sessions: T[],
  answerSessionIds: Iterable<string>,
  transcriptSessionIds: Iterable<string>,
): Array<T & { hasAnswers: boolean; hasTranscript: boolean }> {
  const answers = new Set(answerSessionIds);
  const transcripts = new Set(transcriptSessionIds);
  return sessions.map((s) => ({
    ...s,
    hasAnswers: answers.has(s.id),
    hasTranscript: transcripts.has(s.id),
  }));
}

export function countDebriefEligibility(sessions: DebriefListSession[]): {
  totalCompletedSessions: number;
  eligibleSessions: number;
  ineligibleSessions: number;
} {
  const totalCompletedSessions = sessions.length;
  const eligibleSessions = sessions.filter((s) => isDebriefEligibleSession(s)).length;
  return {
    totalCompletedSessions,
    eligibleSessions,
    ineligibleSessions: Math.max(0, totalCompletedSessions - eligibleSessions),
  };
}

/** Unified list: saved debriefs + processing/failed jobs + pending sessions, newest first. */
export function mergeDebriefListItems(params: {
  debriefs: DebriefListDebrief[];
  sessionsById: Record<string, DebriefListSession>;
  pendingSessions: DebriefListSession[];
  processingJobs?: DebriefListProcessingJob[];
  failedJobs?: DebriefListFailedJob[];
}): DebriefListItem[] {
  const items: DebriefListItem[] = [];
  const processingSessionIds = new Set(
    (params.processingJobs ?? []).map((j) => j.sessionId),
  );
  const failedSessionIds = new Set(
    (params.failedJobs ?? []).map((j) => j.sessionId),
  );

  for (const d of params.debriefs) {
    const session = d.session_id
      ? params.sessionsById[d.session_id] ?? null
      : null;
    items.push({
      kind: "debrief",
      id: d.id,
      sortAt: d.created_at,
      debrief: d,
      session,
    });
  }

  for (const job of params.processingJobs ?? []) {
    items.push({
      kind: "processing",
      id: `processing:${job.jobId}`,
      sortAt: job.updatedAt || job.createdAt || new Date(0).toISOString(),
      job,
      session: params.sessionsById[job.sessionId] ?? null,
    });
  }

  for (const job of params.failedJobs ?? []) {
    // Prefer in-flight processing over a stale failed row for the same session.
    if (processingSessionIds.has(job.sessionId)) continue;
    items.push({
      kind: "failed",
      id: `failed:${job.jobId}`,
      sortAt: job.updatedAt || new Date(0).toISOString(),
      job,
      session: params.sessionsById[job.sessionId] ?? null,
    });
  }

  for (const s of params.pendingSessions) {
    // Prefer processing or failed row when a job already exists for this session.
    if (processingSessionIds.has(s.id) || failedSessionIds.has(s.id)) continue;
    items.push({
      kind: "pending",
      id: `pending:${s.id}`,
      sortAt: s.created_at,
      session: s,
    });
  }

  items.sort(
    (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime(),
  );
  return items;
}

export function filterDebriefListItems(
  items: DebriefListItem[],
  search: string,
): DebriefListItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    if (item.kind === "debrief") {
      const sess = item.session;
      return (
        (sess?.type ?? "").toLowerCase().includes(q) ||
        (sess?.title ?? "").toLowerCase().includes(q) ||
        (item.debrief.priority_focus ?? "").toLowerCase().includes(q) ||
        (item.debrief.overall_grade ?? "").toLowerCase().includes(q)
      );
    }
    if (item.kind === "processing") {
      const sess = item.session;
      return (
        (sess?.type ?? "").toLowerCase().includes(q) ||
        (sess?.title ?? "").toLowerCase().includes(q) ||
        "processing".includes(q) ||
        "queued".includes(q)
      );
    }
    if (item.kind === "failed") {
      const sess = item.session;
      return (
        (sess?.type ?? "").toLowerCase().includes(q) ||
        (sess?.title ?? "").toLowerCase().includes(q) ||
        "failed".includes(q) ||
        (item.job.errorMessage ?? "").toLowerCase().includes(q)
      );
    }
    return (
      (item.session.type ?? "").toLowerCase().includes(q) ||
      (item.session.title ?? "").toLowerCase().includes(q) ||
      "ready to generate".includes(q)
    );
  });
}
