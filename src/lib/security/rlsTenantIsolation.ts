/**
 * Documented RLS tenant isolation contract (B2C: tenant = auth.uid()).
 * Runtime DB probes need a live project; these predicates are the source of
 * truth for unit tests and the security report.
 */

export type IsolationTable = {
  table: string;
  ownerColumn: string;
  crossUserSelect: "denied" | "public_catalog" | "admin_only";
};

export const USER_OWNED_TABLES: IsolationTable[] = [
  { table: "sessions", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "resumes", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "job_descriptions", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "mock_tests", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "test_responses", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "session_transcripts", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "interview_practice_plans", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "interview_practice_plan_items", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "course_enrollments", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "lesson_progress", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "quiz_progress", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "course_certificates", ownerColumn: "user_id", crossUserSelect: "admin_only" },
  { table: "personal_library_documents", ownerColumn: "owner_id", crossUserSelect: "denied" },
  { table: "document_practice_sets", ownerColumn: "owner_id", crossUserSelect: "denied" },
  { table: "practice_workspace_sessions", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "coding_submissions", ownerColumn: "user_id", crossUserSelect: "admin_only" },
  { table: "gap_analyses", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "scorecards", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "interview_day_checklists", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "answer_bank", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "interviews", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "documents", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "notifications", ownerColumn: "user_id", crossUserSelect: "denied" },
  { table: "payment_orders", ownerColumn: "user_id", crossUserSelect: "denied" },
];

export const PLATFORM_CATALOG_TABLES = [
  "gov_exams",
  "gov_exam_stages",
  "questions",
] as const;

export function rlsPredicate(table: IsolationTable, viewerId: string): string {
  return `${table.table}.${table.ownerColumn} = '${viewerId}'`;
}

export function canUserAReadUserBRow(opts: {
  table: IsolationTable;
  ownerId: string;
  viewerId: string;
  viewerIsAdmin?: boolean;
}): boolean {
  if (opts.ownerId === opts.viewerId) return true;
  if (opts.viewerIsAdmin && opts.table.crossUserSelect !== "denied") return true;
  if (opts.table.crossUserSelect === "public_catalog") return true;
  if (opts.viewerIsAdmin && opts.table.crossUserSelect === "admin_only") return true;
  return false;
}
