/**
 * Government exam admin content-ops helpers.
 * Mutations go through Supabase client; RLS must allow is_admin() or, for
 * question review/hide, is_moderator().
 * Audit rows are written to admin_audit_log when the insert policy permits.
 */

import { supabase } from "@/lib/supabase/client";
import {
  TRANSLATION_REVIEW_STATES,
  normalizeQuestionLanguage,
  type TranslationReviewState,
} from "@/lib/gov-exam/questionTranslations";
import {
  writeAdminAudit,
  type AdminAuditPayload,
} from "@/lib/admin/writeAdminAudit";
import { QUALITY_ALGORITHM_VERSION } from "@/lib/gov-exam/algorithmCatalog";

export { writeAdminAudit };
export type { AdminAuditPayload };

export { TRANSLATION_REVIEW_STATES };
export type { TranslationReviewState };
export { QUALITY_ALGORITHM_VERSION };

/** Untyped accessor — gov_* tables are not yet in generated Database types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

export const SOURCE_REVIEW_STATES = [
  "draft",
  "in_review",
  "approved",
  "retired",
  "rejected",
] as const;
export type SourceReviewState = (typeof SOURCE_REVIEW_STATES)[number];

export const REGISTRY_REVIEW_STATES = [
  "draft",
  "in_review",
  "approved",
  "retired",
] as const;
export type RegistryReviewState = (typeof REGISTRY_REVIEW_STATES)[number];

export const PAPER_REVIEW_STATES = [
  "draft",
  "machine_validated",
  "needs_review",
  "expert_reviewed",
  "approved",
  "rejected",
  "retired",
] as const;
export type PaperReviewState = (typeof PAPER_REVIEW_STATES)[number];

export const DOCUMENT_TYPES = [
  "notification",
  "syllabus",
  "pattern",
  "previous_paper",
  "answer_key",
  "corrigendum",
] as const;

export const LICENSE_CLASSES = [
  "official_public",
  "licensed",
  "user_upload",
  "institution",
  "ai_generated",
  "unknown",
] as const;

/** Question queue status derived from is_verified / is_public / metadata.needs_review. */
export type QuestionQueueStatus = "pending" | "approved" | "rejected" | "retired";

/** Explicit bank-certification actions — never auto-applied. */
export type QuestionVerifyAction = "verify" | "unpublish";

export function deriveQuestionQueueStatus(row: {
  is_verified?: boolean | null;
  is_public?: boolean | null;
  metadata?: Record<string, unknown> | null;
}): QuestionQueueStatus {
  const needsReview = row.metadata?.needs_review === true;
  if (needsReview && !row.is_verified) return "pending";
  if (row.is_public === false) {
    return row.is_verified ? "retired" : "rejected";
  }
  if (row.is_verified) return "approved";
  return "pending";
}

/** How many more public+verified questions are needed to hit pattern total. */
export function verificationRunwayNeeded(
  approvedPublicCount: number,
  requiredQuestions: number,
): number {
  const approved = Math.max(0, Math.floor(Number(approvedPublicCount) || 0));
  const required = Math.max(0, Math.floor(Number(requiredQuestions) || 0));
  return Math.max(0, required - approved);
}

export function questionPatchForStatus(
  status: "approved" | "rejected" | "retired",
  previousMetadata?: Record<string, unknown> | null,
): { is_verified: boolean; is_public: boolean; metadata: Record<string, unknown> } {
  const base = { ...(previousMetadata ?? {}) };
  switch (status) {
    case "approved":
      return {
        is_verified: true,
        is_public: true,
        metadata: { ...base, needs_review: false },
      };
    case "rejected":
      return {
        is_verified: false,
        is_public: false,
        metadata: { ...base, needs_review: false },
      };
    case "retired":
      return {
        is_verified: true,
        is_public: false,
        metadata: { ...base, needs_review: false },
      };
  }
}

/** Patches for certification runway actions (verify existing public rows; unpublish). */
export function questionPatchForVerifyAction(
  action: QuestionVerifyAction,
  previous?: {
    is_verified?: boolean | null;
    is_public?: boolean | null;
    metadata?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const base = { ...(previous?.metadata ?? {}) };
  if (action === "verify") {
    return {
      is_verified: true,
      is_public: true,
      metadata: { ...base, needs_review: false },
    };
  }
  return {
    is_public: false,
    metadata: { ...base, unpublished_via: "admin_verify_queue" },
  };
}

export function canSetRegistryReviewState(
  next: string,
): next is RegistryReviewState {
  return (REGISTRY_REVIEW_STATES as readonly string[]).includes(next);
}

export function canSetSourceReviewState(next: string): next is SourceReviewState {
  return (SOURCE_REVIEW_STATES as readonly string[]).includes(next);
}

export function canSetPaperReviewState(next: string): next is PaperReviewState {
  return (PAPER_REVIEW_STATES as readonly string[]).includes(next);
}

export function summarizeBlueprint(blueprint: unknown): string {
  if (!blueprint || typeof blueprint !== "object") return "—";
  const b = blueprint as Record<string, unknown>;
  const sections = Array.isArray(b.sections) ? b.sections : [];
  const total =
    typeof b.totalQuestions === "number"
      ? b.totalQuestions
      : typeof b.total_questions === "number"
        ? b.total_questions
        : sections.reduce((n, s) => {
            const q = (s as { question_count?: number; questionCount?: number })
              ?.question_count ??
              (s as { questionCount?: number })?.questionCount;
            return n + (typeof q === "number" ? q : 0);
          }, 0);
  const mode = typeof b.mode === "string" ? b.mode : null;
  const parts = [
    total ? `${total} Q` : null,
    sections.length ? `${sections.length} sections` : null,
    mode,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "blueprint present";
}

async function mutateWithAudit(params: {
  table: string;
  id: string;
  patch: Record<string, unknown>;
  action: string;
  targetType: string;
  oldValue?: unknown;
}): Promise<{ error: string | null }> {
  const { data, error } = await db()
    .from(params.table)
    .update(params.patch)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) {
    return { error: "Update matched 0 rows (missing id or insufficient permissions)" };
  }

  const audit = await writeAdminAudit({
    action: params.action,
    targetType: params.targetType,
    targetId: params.id,
    oldValue: params.oldValue,
    newValue: params.patch,
  });
  if (!audit.ok) {
    // Mutation succeeded; audit failure is non-fatal for ops UX.
    console.warn("[gov-admin] audit write failed:", audit.error);
  }
  return { error: null };
}

// ── Sources ──────────────────────────────────────────────────────────────────

export type OfficialSourceRow = {
  id: string;
  recruiting_body_id: string | null;
  exam_id: string | null;
  document_type: string;
  title: string;
  source_url: string | null;
  license_class: string;
  review_state: SourceReviewState;
  publication_date: string | null;
  retrieved_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function listOfficialSources(filters: {
  reviewState?: string;
  documentType?: string;
  limit?: number;
}): Promise<{ data: OfficialSourceRow[]; error: string | null }> {
  let q = db()
    .from("gov_official_sources")
    .select(
      "id, recruiting_body_id, exam_id, document_type, title, source_url, license_class, review_state, publication_date, retrieved_at, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.reviewState && filters.reviewState !== "all") {
    q = q.eq("review_state", filters.reviewState);
  }
  if (filters.documentType && filters.documentType !== "all") {
    q = q.eq("document_type", filters.documentType);
  }

  const { data, error } = await q;
  return {
    data: (data ?? []) as OfficialSourceRow[],
    error: error?.message ?? null,
  };
}

export async function registerOfficialSource(input: {
  title: string;
  source_url: string;
  document_type: string;
  license_class: string;
  exam_id?: string | null;
  recruiting_body_id?: string | null;
}): Promise<{ id?: string; error: string | null }> {
  const row = {
    title: input.title.trim(),
    source_url: input.source_url.trim() || null,
    document_type: input.document_type,
    license_class: input.license_class,
    exam_id: input.exam_id || null,
    recruiting_body_id: input.recruiting_body_id || null,
    review_state: "draft" as const,
    metadata: { registered_via: "admin_console" },
  };

  const { data, error } = await db()
    .from("gov_official_sources")
    .insert(row)
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAdminAudit({
    action: "gov_source.register",
    targetType: "gov_official_sources",
    targetId: data.id as string,
    newValue: row,
  });

  return { id: data.id as string, error: null };
}

export async function setSourceReviewState(
  id: string,
  next: SourceReviewState,
  previous?: SourceReviewState,
): Promise<{ error: string | null }> {
  if (!canSetSourceReviewState(next)) {
    return { error: `Invalid source review_state: ${next}` };
  }
  return mutateWithAudit({
    table: "gov_official_sources",
    id,
    patch: { review_state: next },
    action: `gov_source.${next}`,
    targetType: "gov_official_sources",
    oldValue: previous ? { review_state: previous } : undefined,
  });
}

// ── Exam registry ────────────────────────────────────────────────────────────

export type GovExamRow = {
  id: string;
  code: string;
  name: string;
  family: string;
  description: string | null;
  legacy_exam_type: string | null;
  review_state: RegistryReviewState;
  is_public: boolean;
  recruiting_body_id: string;
  created_at: string;
  recruiting_bodies?: { code: string; name: string } | null;
};

export async function listGovExamsAdmin(filters: {
  reviewState?: string;
  family?: string;
  limit?: number;
}): Promise<{ data: GovExamRow[]; error: string | null }> {
  let q = db()
    .from("gov_exams")
    .select(
      "id, code, name, family, description, legacy_exam_type, review_state, is_public, recruiting_body_id, created_at, recruiting_bodies(code, name)",
    )
    .order("code", { ascending: true })
    .limit(filters.limit ?? 200);

  if (filters.reviewState && filters.reviewState !== "all") {
    q = q.eq("review_state", filters.reviewState);
  }
  if (filters.family && filters.family !== "all") {
    q = q.eq("family", filters.family);
  }

  const { data, error } = await q;
  return { data: (data ?? []) as GovExamRow[], error: error?.message ?? null };
}

export async function listExamStages(examId: string) {
  const { data, error } = await db()
    .from("gov_exam_stages")
    .select("id, exam_id, code, name, sort_order")
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function listPatternVersions(examId: string) {
  const { data, error } = await db()
    .from("gov_exam_pattern_versions")
    .select(
      "id, exam_id, stage_id, version, effective_date, total_questions, total_marks, duration_minutes, negative_mark, review_state, source_url, created_at",
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function listSyllabusVersions(examId: string) {
  const { data, error } = await db()
    .from("gov_exam_syllabus_versions")
    .select(
      "id, exam_id, stage_id, version, effective_date, source_url, review_state, topics_json, created_at",
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function setExamReviewState(
  id: string,
  next: RegistryReviewState,
  previous?: RegistryReviewState,
  opts?: { isPublic?: boolean },
): Promise<{ error: string | null }> {
  if (!canSetRegistryReviewState(next)) {
    return { error: `Invalid exam review_state: ${next}` };
  }
  const patch: Record<string, unknown> = {
    review_state: next,
    updated_at: new Date().toISOString(),
  };
  if (opts?.isPublic !== undefined) patch.is_public = opts.isPublic;
  if (next === "approved" && opts?.isPublic === undefined) patch.is_public = true;
  if (next === "retired") patch.is_public = false;

  return mutateWithAudit({
    table: "gov_exams",
    id,
    patch,
    action: `gov_exam.${next}`,
    targetType: "gov_exams",
    oldValue: previous ? { review_state: previous } : undefined,
  });
}

export async function setPatternReviewState(
  id: string,
  next: RegistryReviewState,
  previous?: RegistryReviewState,
): Promise<{ error: string | null }> {
  if (!canSetRegistryReviewState(next)) {
    return { error: `Invalid pattern review_state: ${next}` };
  }
  return mutateWithAudit({
    table: "gov_exam_pattern_versions",
    id,
    patch: { review_state: next },
    action: `gov_pattern.${next}`,
    targetType: "gov_exam_pattern_versions",
    oldValue: previous ? { review_state: previous } : undefined,
  });
}

export async function setSyllabusReviewState(
  id: string,
  next: RegistryReviewState,
  previous?: RegistryReviewState,
): Promise<{ error: string | null }> {
  if (!canSetRegistryReviewState(next)) {
    return { error: `Invalid syllabus review_state: ${next}` };
  }
  return mutateWithAudit({
    table: "gov_exam_syllabus_versions",
    id,
    patch: { review_state: next },
    action: `gov_syllabus.${next}`,
    targetType: "gov_exam_syllabus_versions",
    oldValue: previous ? { review_state: previous } : undefined,
  });
}

// ── Bank readiness matrix ────────────────────────────────────────────────────

export type GovExamBankReadinessRow = {
  exam_id: string;
  exam_code: string;
  exam_name: string;
  family: string;
  legacy_exam_type: string | null;
  stage_id: string | null;
  stage_code: string | null;
  pattern_version_id: string | null;
  pattern_version: string | null;
  required_questions: number;
  approved_public_count: number;
  public_count: number;
  status: "ready" | "partial" | "empty";
  full_simulation_available: boolean;
};

export async function listGovExamBankReadiness(examId?: string): Promise<{
  data: GovExamBankReadinessRow[];
  error: string | null;
}> {
  const { data, error } = examId
    ? await db().rpc("get_gov_exam_bank_readiness", { p_exam_id: examId })
    : await db().rpc("get_gov_exam_bank_readiness");

  if (error) return { data: [], error: error.message };

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const statusRaw = String(row.status ?? "empty");
    const status =
      statusRaw === "ready" || statusRaw === "partial" || statusRaw === "empty"
        ? statusRaw
        : "empty";
    return {
      exam_id: String(row.exam_id ?? ""),
      exam_code: String(row.exam_code ?? ""),
      exam_name: String(row.exam_name ?? ""),
      family: String(row.family ?? ""),
      legacy_exam_type: (row.legacy_exam_type as string | null) ?? null,
      stage_id: (row.stage_id as string | null) ?? null,
      stage_code: (row.stage_code as string | null) ?? null,
      pattern_version_id: (row.pattern_version_id as string | null) ?? null,
      pattern_version: (row.pattern_version as string | null) ?? null,
      required_questions: Number(row.required_questions) || 0,
      approved_public_count: Number(row.approved_public_count) || 0,
      public_count: Number(row.public_count) || 0,
      status,
      full_simulation_available: Boolean(row.full_simulation_available),
    } satisfies GovExamBankReadinessRow;
  });

  return { data: rows, error: null };
}

export type VerificationRunwayRow = GovExamBankReadinessRow & {
  unverified_public_count: number;
  verifies_needed: number;
};

/** Enrich bank readiness with unverified-public count and verifies still needed. */
export function buildVerificationRunway(
  readiness: GovExamBankReadinessRow[],
  unverifiedByLegacyType: Record<string, number> = {},
): VerificationRunwayRow[] {
  return readiness.map((row) => {
    const legacy = row.legacy_exam_type ?? "";
    const unverified = Math.max(0, Math.floor(unverifiedByLegacyType[legacy] ?? 0));
    const verifies_needed = verificationRunwayNeeded(
      row.approved_public_count,
      row.required_questions,
    );
    return {
      ...row,
      unverified_public_count: unverified,
      verifies_needed,
    };
  });
}

export async function listVerificationRunway(examId?: string): Promise<{
  data: VerificationRunwayRow[];
  error: string | null;
}> {
  const { data: readiness, error } = await listGovExamBankReadiness(examId);
  if (error) return { data: [], error };

  const legacyTypes = [
    ...new Set(
      readiness
        .map((r) => r.legacy_exam_type)
        .filter((t): t is string => Boolean(t)),
    ),
  ];

  const unverifiedByLegacyType: Record<string, number> = {};
  await Promise.all(
    legacyTypes.map(async (legacy) => {
      const { count, error: cErr } = await db()
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("exam_type", legacy)
        .eq("is_public", true)
        .eq("is_verified", false);
      if (!cErr) unverifiedByLegacyType[legacy] = count ?? 0;
    }),
  );

  return {
    data: buildVerificationRunway(readiness, unverifiedByLegacyType),
    error: null,
  };
}

// ── Questions review queue ───────────────────────────────────────────────────

export type QuestionReviewRow = {
  id: string;
  question_text: string;
  exam_type: string | null;
  topic: string;
  subject: string;
  difficulty: string | null;
  source: string | null;
  source_type: string | null;
  /** Optional — not present on all environments; never required for listing. */
  quality_score?: number | null;
  quality_algorithm_version?: string | null;
  is_verified: boolean | null;
  is_public: boolean | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type QuestionReviewFilterStatus =
  | QuestionQueueStatus
  | "all"
  | "public_unverified";

export function questionMissingSource(row: Pick<QuestionReviewRow, "source" | "source_type" | "metadata">): boolean {
  const source = String(row.source ?? "").trim();
  const sourceType = String(row.source_type ?? "").trim();
  const meta = row.metadata ?? {};
  const metaSource = String(meta.source ?? meta.source_url ?? "").trim();
  return !source && !sourceType && !metaSource;
}

export async function listQuestionsForReview(filters: {
  examType?: string;
  topic?: string;
  status?: QuestionReviewFilterStatus;
  missingSourceOnly?: boolean;
  /** When true, forces is_public=true AND is_verified=false (certification runway). */
  publicUnverifiedOnly?: boolean;
  limit?: number;
}): Promise<{ data: QuestionReviewRow[]; error: string | null }> {
  // Do not select `quality_score` — column exists on paper question joins in some
  // environments but is absent on `public.questions` in production (PGRST/42703 → HTTP 400).
  let q = db()
    .from("questions")
    .select(
      "id, question_text, exam_type, topic, subject, difficulty, source, source_type, quality_algorithm_version, metadata, is_verified, is_public, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.examType && filters.examType !== "all") {
    q = q.eq("exam_type", filters.examType);
  }
  if (filters.topic?.trim()) {
    q = q.ilike("topic", `%${filters.topic.trim()}%`);
  }

  const status = filters.status ?? "all";
  const publicUnverified =
    filters.publicUnverifiedOnly === true || status === "public_unverified";

  // Broad fetch then filter pending client-side so OCR needs_review (is_public=false) appears.
  if (publicUnverified) {
    q = q.eq("is_public", true).eq("is_verified", false);
  } else if (status === "approved") {
    q = q.eq("is_verified", true).eq("is_public", true);
  } else if (status === "retired") {
    q = q.eq("is_verified", true).eq("is_public", false);
  } else if (status === "rejected") {
    q = q.eq("is_verified", false).eq("is_public", false);
  } else if (status === "pending") {
    q = q.eq("is_verified", false);
  }

  const { data, error } = await q;
  let rows = (data ?? []) as QuestionReviewRow[];
  if (!publicUnverified && status === "pending") {
    rows = rows.filter((r) => deriveQuestionQueueStatus(r) === "pending");
  } else if (!publicUnverified && status === "rejected") {
    rows = rows.filter((r) => deriveQuestionQueueStatus(r) === "rejected");
  }
  if (filters.missingSourceOnly) {
    rows = rows.filter((r) => questionMissingSource(r));
  }
  rows = rows.slice(0, filters.limit ?? 100);

  let friendly: string | null = null;
  if (error) {
    const raw = error.message || "Unable to load questions";
    if (/quality_score|column .* does not exist/i.test(raw)) {
      friendly =
        "Question review is unavailable due to a schema mismatch. Retry after the latest migration.";
    } else if (/permission|rls|not authorized|42501/i.test(raw)) {
      friendly = "You are not authorized to review questions.";
    } else {
      friendly = "Unable to load the question review queue. Please retry.";
    }
  }

  return {
    data: error ? [] : rows,
    error: friendly,
  };
}

export async function setQuestionReviewStatus(
  id: string,
  status: "approved" | "rejected" | "retired",
  previous?: {
    is_verified?: boolean | null;
    is_public?: boolean | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ error: string | null }> {
  const patch = questionPatchForStatus(status, previous?.metadata);
  return mutateWithAudit({
    table: "questions",
    id,
    patch: { ...patch, updated_at: new Date().toISOString() },
    action: `gov_question.${status}`,
    targetType: "questions",
    oldValue: previous,
  });
}

/**
 * Explicit certification action on an existing question.
 * Does not invent content — only flips verification / visibility flags.
 */
export async function applyQuestionVerifyAction(
  id: string,
  action: QuestionVerifyAction,
  previous?: {
    is_verified?: boolean | null;
    is_public?: boolean | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ error: string | null }> {
  const patch = questionPatchForVerifyAction(action, previous);
  return mutateWithAudit({
    table: "questions",
    id,
    patch: { ...patch, updated_at: new Date().toISOString() },
    action: `gov_question.${action}`,
    targetType: "questions",
    oldValue: previous,
  });
}

/**
 * Bulk certification actions. Caller MUST obtain explicit UI confirm first —
 * this helper does not invent a confirm dialog.
 */
export async function bulkApplyQuestionVerifyAction(
  ids: string[],
  action: QuestionVerifyAction,
  rowsById?: Map<string, QuestionReviewRow>,
): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }> {
  const unique = [...new Set(ids.filter(Boolean))];
  let ok = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of unique) {
    const prev = rowsById?.get(id);
    const { error } = await applyQuestionVerifyAction(id, action, prev);
    if (error) failed.push({ id, error });
    else ok += 1;
  }
  return { ok, failed };
}

/**
 * Queue a translation request without inventing translated text.
 * Creates/updates a draft stub + marks metadata.translation_requested.
 */
export async function requestQuestionTranslation(
  questionId: string,
  language: string,
  previous?: QuestionReviewRow | null,
): Promise<{ error: string | null }> {
  const lang = normalizeQuestionLanguage(language);
  if (lang === "en") {
    return { error: "Pick a regional language (not English)." };
  }

  const stubText = `[Translation requested — ${lang}]`;
  const { error: upsertErr } = await db()
    .from("question_translations")
    .upsert(
      {
        question_id: questionId,
        language: lang,
        question_text: stubText,
        options: null,
        explanation: null,
        review_state: "draft",
        reviewer_id: null,
        source_version: "admin_request",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "question_id,language" },
    );

  if (upsertErr) return { error: upsertErr.message };

  const base = { ...(previous?.metadata ?? {}) };
  const requested = Array.isArray(base.translation_requested)
    ? [...(base.translation_requested as string[])]
    : typeof base.translation_requested === "string"
      ? [base.translation_requested as string]
      : [];
  if (!requested.includes(lang)) requested.push(lang);

  const patch = {
    metadata: {
      ...base,
      translation_requested: requested,
      translation_requested_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  const { error: qErr } = await db()
    .from("questions")
    .update(patch)
    .eq("id", questionId);
  if (qErr) return { error: qErr.message };

  const audit = await writeAdminAudit({
    action: "gov_question.request_translation",
    targetType: "questions",
    targetId: questionId,
    oldValue: previous
      ? { is_verified: previous.is_verified, is_public: previous.is_public, metadata: previous.metadata }
      : undefined,
    newValue: { language: lang, ...patch },
  });
  if (!audit.ok) {
    console.warn("[gov-admin] audit write failed:", audit.error);
  }
  return { error: null };
}

export async function bulkRequestQuestionTranslation(
  ids: string[],
  language: string,
  rowsById?: Map<string, QuestionReviewRow>,
): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }> {
  const unique = [...new Set(ids.filter(Boolean))];
  let ok = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of unique) {
    const { error } = await requestQuestionTranslation(id, language, rowsById?.get(id));
    if (error) failed.push({ id, error });
    else ok += 1;
  }
  return { ok, failed };
}

// ── PDF / OCR extract jobs ───────────────────────────────────────────────────

export type IngestionJobRow = {
  id: string;
  source_id: string;
  status: string;
  error: string | null;
  parser_version: string;
  metadata: Record<string, unknown>;
  paper_id: string | null;
  questions_imported: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export async function listIngestionJobs(filters?: {
  limit?: number;
}): Promise<{ data: IngestionJobRow[]; error: string | null }> {
  const { data, error } = await db()
    .from("source_ingestion_jobs")
    .select(
      "id, source_id, status, error, parser_version, metadata, paper_id, questions_imported, started_at, completed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 40);
  return {
    data: (data ?? []) as IngestionJobRow[],
    error: error?.message ?? null,
  };
}

export type ExtractQuestionPaperResult = {
  jobId?: string;
  sourceId?: string;
  paperId?: string | null;
  status?: string;
  async?: boolean;
  questionsImported?: number;
  confidenceFlags?: Array<{ index: number; flags: string[]; score: number }>;
  lowConfidenceCount?: number;
  message?: string;
  error?: string;
};

export async function triggerExtractQuestionPaper(body: Record<string, unknown>): Promise<{
  data: ExtractQuestionPaperResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke("extract-question-paper", {
    body,
  });
  if (error) {
    return { data: null, error: error.message };
  }
  const envelope = data as {
    success?: boolean;
    data?: ExtractQuestionPaperResult;
    error?: string | { message?: string };
  } | null;
  if (envelope && typeof envelope === "object" && envelope.success === false) {
    const err =
      typeof envelope.error === "string"
        ? envelope.error
        : envelope.error?.message ?? "Extract failed";
    return { data: null, error: err };
  }
  const inner =
    envelope && typeof envelope === "object" && envelope.data
      ? envelope.data
      : (data as ExtractQuestionPaperResult);
  return { data: inner ?? null, error: null };
}

// ── Generated papers ─────────────────────────────────────────────────────────

export type GeneratedPaperRow = {
  id: string;
  exam_id: string;
  title: string;
  paper_class: string;
  language: string;
  question_count: number;
  total_marks: number;
  duration_minutes: number;
  blueprint_json: unknown;
  review_state: PaperReviewState;
  quality_score: number | null;
  mock_test_id: string | null;
  created_at: string;
  gov_exams?: { code: string; name: string } | null;
};

export async function listGeneratedPapers(filters: {
  reviewState?: string;
  limit?: number;
}): Promise<{ data: GeneratedPaperRow[]; error: string | null }> {
  let q = db()
    .from("gov_generated_papers")
    .select(
      "id, exam_id, title, paper_class, language, question_count, total_marks, duration_minutes, blueprint_json, review_state, quality_score, mock_test_id, created_at, gov_exams(code, name)",
    )
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.reviewState && filters.reviewState !== "all") {
    q = q.eq("review_state", filters.reviewState);
  }

  const { data, error } = await q;
  return {
    data: (data ?? []) as GeneratedPaperRow[],
    error: error?.message ?? null,
  };
}

export async function setPaperReviewState(
  id: string,
  next: PaperReviewState,
  previous?: PaperReviewState,
): Promise<{ error: string | null }> {
  if (!canSetPaperReviewState(next)) {
    return { error: `Invalid paper review_state: ${next}` };
  }
  // Do not allow jumping straight to approved from draft/failed-like states.
  if (next === "approved") {
    const allowedFrom = new Set<string>([
      "machine_validated",
      "needs_review",
      "expert_reviewed",
    ]);
    if (previous && !allowedFrom.has(previous)) {
      return {
        error: "Papers must be validated or expert-reviewed before approval.",
      };
    }
  }
  return mutateWithAudit({
    table: "gov_generated_papers",
    id,
    patch: { review_state: next },
    action: `gov_paper.${next}`,
    targetType: "gov_generated_papers",
    oldValue: previous ? { review_state: previous } : undefined,
  });
}

export async function listRecruitingBodies() {
  const { data, error } = await db()
    .from("recruiting_bodies")
    .select("id, code, name, jurisdiction, is_active")
    .order("code", { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}

// ── Question translations (regional review) ──────────────────────────────────

export type QuestionTranslationRow = {
  id: string;
  question_id: string;
  language: string;
  question_text: string;
  options: unknown;
  explanation: string | null;
  review_state: TranslationReviewState;
  reviewer_id: string | null;
  source_version: string | null;
  created_at: string;
  updated_at: string;
  questions?: {
    id: string;
    question_text: string;
    options: unknown;
    explanation: string | null;
    exam_type: string | null;
    topic: string;
  } | null;
};

export function canSetTranslationReviewState(
  next: string,
): next is TranslationReviewState {
  return (TRANSLATION_REVIEW_STATES as readonly string[]).includes(next);
}

export async function listTranslationsForReview(filters: {
  language?: string;
  reviewState?: string;
  limit?: number;
}): Promise<{ data: QuestionTranslationRow[]; error: string | null }> {
  let q = db()
    .from("question_translations")
    .select(
      "id, question_id, language, question_text, options, explanation, review_state, reviewer_id, source_version, created_at, updated_at, questions(id, question_text, options, explanation, exam_type, topic)",
    )
    .order("updated_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.language && filters.language !== "all") {
    q = q.eq("language", normalizeQuestionLanguage(filters.language));
  }
  if (filters.reviewState && filters.reviewState !== "all") {
    q = q.eq("review_state", filters.reviewState);
  }

  const { data, error } = await q;
  return {
    data: (data ?? []) as QuestionTranslationRow[],
    error: error?.message ?? null,
  };
}

/** Convenience alias for the pending review queue. */
export async function listPendingTranslations(filters?: {
  language?: string;
  limit?: number;
}) {
  return listTranslationsForReview({
    language: filters?.language,
    reviewState: "needs_review",
    limit: filters?.limit,
  });
}

export async function submitTranslationDraft(input: {
  questionId: string;
  language: string;
  questionText: string;
  options?: unknown;
  explanation?: string | null;
  sourceVersion?: string | null;
  /** Defaults to needs_review — never auto-approve machine drafts. */
  reviewState?: "draft" | "needs_review";
}): Promise<{ id?: string; error: string | null }> {
  const language = normalizeQuestionLanguage(input.language);
  if (language === "en") {
    return { error: "English is the source language; submit a regional code (e.g. hi)." };
  }
  const reviewState = input.reviewState ?? "needs_review";
  if (reviewState !== "draft" && reviewState !== "needs_review") {
    return { error: "Drafts must be draft or needs_review (not approved)." };
  }
  if (!input.questionText.trim()) {
    return { error: "question_text is required" };
  }

  const row = {
    question_id: input.questionId,
    language,
    question_text: input.questionText.trim(),
    options: input.options ?? null,
    explanation: input.explanation?.trim() || null,
    review_state: reviewState,
    reviewer_id: null,
    source_version: input.sourceVersion ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db()
    .from("question_translations")
    .upsert(row, { onConflict: "question_id,language" })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAdminAudit({
    action: "gov_translation.submit_draft",
    targetType: "question_translations",
    targetId: data.id as string,
    newValue: { ...row, id: data.id },
  });

  return { id: data.id as string, error: null };
}

export async function setTranslationReviewState(
  id: string,
  next: TranslationReviewState,
  previous?: TranslationReviewState,
): Promise<{ error: string | null }> {
  if (!canSetTranslationReviewState(next)) {
    return { error: `Invalid translation review_state: ${next}` };
  }

  const { data: auth } = await supabase.auth.getUser();
  const reviewerId = auth.user?.id ?? null;

  const patch: Record<string, unknown> = {
    review_state: next,
    updated_at: new Date().toISOString(),
  };
  if (next === "approved" || next === "rejected") {
    patch.reviewer_id = reviewerId;
  }

  const { error } = await db()
    .from("question_translations")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };

  const audit = await writeAdminAudit({
    action: `gov_translation.${next}`,
    targetType: "question_translations",
    targetId: id,
    oldValue: previous ? { review_state: previous } : undefined,
    newValue: patch,
  });
  if (!audit.ok) {
    console.warn("[gov-admin] audit write failed:", audit.error);
  }
  return { error: null };
}

export async function approveTranslation(
  id: string,
  previous?: TranslationReviewState,
): Promise<{ error: string | null }> {
  return setTranslationReviewState(id, "approved", previous);
}

export async function rejectTranslation(
  id: string,
  previous?: TranslationReviewState,
): Promise<{ error: string | null }> {
  return setTranslationReviewState(id, "rejected", previous);
}

/** Public-safe fetch of approved translations for a question set + language. */
export async function fetchApprovedTranslations(
  questionIds: string[],
  language: string,
): Promise<{
  byQuestionId: Record<
    string,
    {
      question_text: string;
      options: unknown;
      explanation: string | null;
      review_state: string;
      language: string;
    }
  >;
  error: string | null;
}> {
  const lang = normalizeQuestionLanguage(language);
  if (!questionIds.length || lang === "en") {
    return { byQuestionId: {}, error: null };
  }

  const { data, error } = await db()
    .from("question_translations")
    .select("question_id, language, question_text, options, explanation, review_state")
    .in("question_id", questionIds)
    .eq("language", lang)
    .eq("review_state", "approved");

  if (error) return { byQuestionId: {}, error: error.message };

  const byQuestionId: Record<
    string,
    {
      question_text: string;
      options: unknown;
      explanation: string | null;
      review_state: string;
      language: string;
    }
  > = {};

  for (const row of data ?? []) {
    const qid = String(row.question_id);
    byQuestionId[qid] = {
      question_text: String(row.question_text ?? ""),
      options: row.options,
      explanation: row.explanation ?? null,
      review_state: String(row.review_state ?? ""),
      language: String(row.language ?? lang),
    };
  }

  return { byQuestionId, error: null };
}

// ── Auto-approval rules & manual overrides ───────────────────────────────────

export type AutoApprovalRuleRow = {
  id: string;
  entity_type: "question" | "paper";
  rule_version: number;
  enabled: boolean;
  min_quality_score: number;
  duplicate_threshold: number;
  auto_publish: boolean;
  allowed_source_types: string[];
  allowed_exam_ids: string[] | null;
  allowed_languages: string[] | null;
  allow_verified_public: boolean;
  allow_internal_bank: boolean;
  allow_generated_practice: boolean;
  allow_ai_generated_practice: boolean;
  require_provenance: boolean;
  manual_review_flags: string[];
  notes: string | null;
  updated_at: string;
};

export type AdminOverrideAction =
  | "approve"
  | "reject"
  | "send_to_review"
  | "unpublish"
  | "restore"
  | "publish";

export async function listAutoApprovalRules(entityType?: "question" | "paper"): Promise<{
  data: AutoApprovalRuleRow[];
  error: string | null;
}> {
  let q = db()
    .from("gov_auto_approval_rules")
    .select("*")
    .order("entity_type", { ascending: true })
    .order("rule_version", { ascending: false });

  if (entityType) q = q.eq("entity_type", entityType);

  const { data, error } = await q;
  return { data: (data ?? []) as AutoApprovalRuleRow[], error: error?.message ?? null };
}

export async function updateAutoApprovalRule(
  id: string,
  patch: Partial<Omit<AutoApprovalRuleRow, "id" | "updated_at">>,
  previous?: AutoApprovalRuleRow,
): Promise<{ error: string | null }> {
  const { error } = await db()
    .from("gov_auto_approval_rules")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  await writeAdminAudit({
    action: "gov_auto_approval_rule.update",
    targetType: "gov_auto_approval_rules",
    targetId: id,
    oldValue: previous ?? null,
    newValue: patch,
  });

  return { error: null };
}

export async function createAutoApprovalRuleVersion(
  entityType: "question" | "paper",
  patch: Partial<Omit<AutoApprovalRuleRow, "id" | "entity_type" | "updated_at">>,
): Promise<{ id?: string; error: string | null }> {
  const { data: latest } = await db()
    .from("gov_auto_approval_rules")
    .select("rule_version")
    .eq("entity_type", entityType)
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (Number(latest?.rule_version) || 0) + 1;
  const row = {
    entity_type: entityType,
    rule_version: nextVersion,
    enabled: false,
    min_quality_score: 40,
    duplicate_threshold: 0.92,
    auto_publish: false,
    ...patch,
  };

  const { data, error } = await db()
    .from("gov_auto_approval_rules")
    .insert(row)
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAdminAudit({
    action: "gov_auto_approval_rule.create",
    targetType: "gov_auto_approval_rules",
    targetId: data.id as string,
    newValue: { ...row, rule_version: nextVersion },
  });

  return { id: data.id as string, error: null };
}

async function insertQuestionReview(
  questionId: string,
  action: string,
  notes: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  await db().from("question_reviews").insert({
    question_id: questionId,
    reviewer_id: auth.user?.id ?? null,
    action,
    notes,
  });
}

/** Manual admin override — requires reason; writes immutable audit. */
export async function adminOverrideQuestion(
  id: string,
  action: AdminOverrideAction,
  reason: string,
  previous?: {
    is_verified?: boolean | null;
    is_public?: boolean | null;
    review_status?: string | null;
    publish_status?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ error: string | null }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "Override reason is required." };

  const prevStatus = previous?.review_status ?? "unknown";
  let patch: Record<string, unknown>;
  let auditAction: string;

  switch (action) {
    case "approve":
      patch = {
        ...questionPatchForStatus("approved", previous?.metadata),
        review_status: "approved",
        approval_mode: "MANUAL",
        publish_status: previous?.publish_status ?? "draft",
      };
      auditAction = "gov_question.manual_approve";
      break;
    case "reject":
      patch = {
        ...questionPatchForStatus("rejected", previous?.metadata),
        review_status: "rejected",
        approval_mode: null,
      };
      auditAction = "gov_question.manual_reject";
      break;
    case "send_to_review":
      patch = {
        is_verified: false,
        is_public: false,
        review_status: "review_required",
        approval_mode: null,
        metadata: { ...(previous?.metadata ?? {}), needs_review: true },
      };
      auditAction = "gov_question.send_to_review";
      break;
    case "unpublish":
      patch = {
        is_public: false,
        publish_status: "draft",
        metadata: { ...(previous?.metadata ?? {}), unpublished_via: "admin_override" },
      };
      auditAction = "gov_question.unpublish";
      break;
    case "restore":
      patch = {
        is_public: true,
        publish_status: "published",
        metadata: { ...(previous?.metadata ?? {}), restored_via: "admin_override" },
      };
      auditAction = "gov_question.restore";
      break;
    case "publish":
      if (previous?.review_status !== "approved" && !previous?.is_verified) {
        return { error: "Cannot publish unapproved content." };
      }
      patch = {
        is_public: true,
        publish_status: "published",
      };
      auditAction = "gov_question.publish";
      break;
    default:
      return { error: `Unknown override action: ${action}` };
  }

  const result = await mutateWithAudit({
    table: "questions",
    id,
    patch: { ...patch, updated_at: new Date().toISOString() },
    action: auditAction,
    targetType: "questions",
    oldValue: { ...previous, override_reason: trimmedReason, previous_status: prevStatus },
  });

  if (!result.error) {
    await insertQuestionReview(id, action, trimmedReason);
  }

  return result;
}

/** Manual paper override — separate APPROVED from PUBLISHED. */
export async function adminOverridePaper(
  id: string,
  action: AdminOverrideAction,
  reason: string,
  previous?: {
    review_state?: PaperReviewState | null;
    publish_status?: string | null;
  },
): Promise<{ error: string | null }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "Override reason is required." };

  const prevState = previous?.review_state ?? "unknown";
  let patch: Record<string, unknown>;
  let auditAction: string;

  switch (action) {
    case "approve":
      if (
        previous?.review_state &&
        !["machine_validated", "needs_review", "expert_reviewed"].includes(previous.review_state)
      ) {
        return { error: "Paper must be validated before manual approval." };
      }
      patch = { review_state: "approved", approval_mode: "MANUAL", publish_status: "draft" };
      auditAction = "gov_paper.manual_approve";
      break;
    case "reject":
      patch = { review_state: "rejected", approval_mode: null };
      auditAction = "gov_paper.manual_reject";
      break;
    case "send_to_review":
      patch = { review_state: "needs_review", approval_mode: null };
      auditAction = "gov_paper.send_to_review";
      break;
    case "unpublish":
      patch = { publish_status: "draft" };
      auditAction = "gov_paper.unpublish";
      break;
    case "publish":
      if (previous?.review_state !== "approved") {
        return { error: "Cannot publish unapproved paper." };
      }
      patch = { publish_status: "published" };
      auditAction = "gov_paper.publish";
      break;
    case "restore":
      patch = { publish_status: "published", review_state: previous?.review_state ?? "approved" };
      auditAction = "gov_paper.restore";
      break;
    default:
      return { error: `Unknown override action: ${action}` };
  }

  return mutateWithAudit({
    table: "gov_generated_papers",
    id,
    patch,
    action: auditAction,
    targetType: "gov_generated_papers",
    oldValue: { ...previous, override_reason: trimmedReason, previous_status: prevState },
  });
}

export async function listAutoApprovalEvents(
  entityType: "question" | "paper",
  entityId: string,
): Promise<{ data: unknown[]; error: string | null }> {
  const { data, error } = await db()
    .from("gov_auto_approval_events")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(20);

  return { data: data ?? [], error: error?.message ?? null };
}

