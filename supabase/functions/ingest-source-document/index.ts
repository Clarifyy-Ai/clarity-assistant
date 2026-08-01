/**
 * ingest-source-document — admin-only previous-year / official source ingestion.
 *
 * Pilot policy (see docs/EXAM_SOURCE_POLICY.md):
 * - Register/update gov_official_sources metadata
 * - Validate URL host against official allowlist
 * - Do NOT download remote documents when robots/terms are unknown
 * - Accept admin-provided metadata + optional storage_path / textPayload / structured JSON
 * - Questions inserted with is_public=false until approved
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth, errorResponse, successResponse } from "../_shared/utils.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { assertOfficialExamUrl } from "../_shared/officialDomainAllowlist.ts";
import { validateIngestQuestionsPayload } from "../_shared/ingestJsonQuestions.ts";

const PARSER_VERSION = "1.0.0";

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    ? s
    : null;
}

function sanitizeText(v: unknown, max: number): string {
  return String(v ?? "").replace(/[<>]/g, "").slice(0, max).trim();
}

type JobStatus =
  | "queued"
  | "validating_url"
  | "registering_source"
  | "awaiting_payload"
  | "validating_questions"
  | "inserting_questions"
  | "linking_paper"
  | "completed"
  | "failed";

async function setJob(
  db: ReturnType<typeof createServiceClient>,
  jobId: string,
  patch: Record<string, unknown>,
) {
  await db
    .from("source_ingestion_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function findOrCreatePaperShell(
  db: ReturnType<typeof createServiceClient>,
  args: {
    examId: string;
    stageId: string | null;
    year: number;
    cycle: string | null;
    tier: string | null;
    shift: string | null;
    language: string;
    sourceId: string;
    title: string;
    officialStatus: string;
    questionCount: number | null;
    metadata: Record<string, unknown>;
  },
): Promise<string | null> {
  let q = db
    .from("previous_year_papers")
    .select("id")
    .eq("exam_id", args.examId)
    .eq("year", args.year)
    .eq("language", args.language);

  q = args.stageId ? q.eq("stage_id", args.stageId) : q.is("stage_id", null);
  q = args.shift ? q.eq("shift", args.shift) : q.is("shift", null);

  const { data: existing } = await q.maybeSingle();
  if (existing?.id) {
    await db
      .from("previous_year_papers")
      .update({
        source_id: args.sourceId,
        cycle: args.cycle,
        tier: args.tier,
        official_status: args.officialStatus,
        question_count: args.questionCount ?? undefined,
        metadata: args.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: inserted, error: insErr } = await db
    .from("previous_year_papers")
    .insert({
      exam_id: args.examId,
      stage_id: args.stageId,
      year: args.year,
      cycle: args.cycle,
      tier: args.tier,
      shift: args.shift,
      language: args.language,
      source_id: args.sourceId,
      official_status: args.officialStatus,
      answer_key_status: "none",
      review_status: "draft",
      title: args.title,
      question_count: args.questionCount,
      notes:
        "Draft paper from admin ingest. Not approved for public listing until review_status=approved.",
      metadata: args.metadata,
    })
    .select("id")
    .single();

  if (insErr) {
    console.warn("[ingest-source-document] paper shell:", insErr.message);
    return null;
  }
  return (inserted?.id as string) ?? null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
    }

    const auth = await requireAuth(req);
    await requireAdmin(auth.userId);

    const db = createServiceClient();

    if (await isUserBanned(db, auth.userId)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimited = await enforceRateLimitAsync(db, {
      key: createRateLimitKey("ingest-source-document", auth.userId),
      ...RATE_LIMIT_PRESETS.BULK_INGEST,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Invalid JSON body", "BAD_REQUEST", 400, req);
    }
    const b = body as Record<string, unknown>;

    const examId = uuidOrNull(b.examId);
    if (!examId) {
      return errorResponse("examId is required", "VALIDATION_ERROR", 400, req);
    }

    const stageId = uuidOrNull(b.stageId);
    const sourceIdExisting = uuidOrNull(b.sourceId);
    const sourceUrl = sanitizeText(b.sourceUrl, 1000);
    const title = sanitizeText(b.title, 300) || "Official source document";
    const documentType = sanitizeText(b.documentType, 64) || "previous_paper";
    const storagePath = sanitizeText(b.storagePath, 500) || null;
    const textPayload = typeof b.textPayload === "string"
      ? b.textPayload.slice(0, 200_000)
      : null;
    const year = Number(b.year);
    const language = sanitizeText(b.language, 8) || "en";
    const cycle = sanitizeText(b.cycle, 64) || null;
    const tier = sanitizeText(b.tier, 64) || null;
    const shift = sanitizeText(b.shift, 64) || null;
    const downloadRemote = b.downloadRemote === true;
    const createPaper = b.createPaper !== false;
    const requireAllValid = b.requireAllValid === true;
    const legacyExamType = sanitizeText(b.legacyExamType, 64) || null;

    // Pilot: never download remote content (robots/terms unknown).
    if (downloadRemote) {
      return errorResponse(
        "Remote download is disabled for pilot. Provide storagePath, textPayload, or structured questions JSON from an authorized admin upload.",
        "DOWNLOAD_DISABLED",
        403,
        req,
      );
    }

    if (sourceUrl) {
      const hostCheck = assertOfficialExamUrl(sourceUrl);
      if (!hostCheck.ok) {
        return errorResponse(hostCheck.message, hostCheck.code, 403, req);
      }
    } else if (!sourceIdExisting && !storagePath && !textPayload && !Array.isArray(b.questions)) {
      return errorResponse(
        "Provide sourceUrl (allowlisted), sourceId, storagePath, textPayload, and/or questions[].",
        "VALIDATION_ERROR",
        400,
        req,
      );
    }

    const { data: exam, error: examErr } = await db
      .from("gov_exams")
      .select("id, code, recruiting_body_id, legacy_exam_type")
      .eq("id", examId)
      .maybeSingle();

    if (examErr || !exam) {
      return errorResponse("Exam not found", "NOT_FOUND", 404, req);
    }

    // ── Register / update source ───────────────────────────────────────────
    let sourceId = sourceIdExisting;
    if (!sourceId) {
      const { data: src, error: srcErr } = await db
        .from("gov_official_sources")
        .insert({
          recruiting_body_id: exam.recruiting_body_id,
          exam_id: examId,
          document_type: documentType,
          title,
          source_url: sourceUrl || null,
          storage_path: storagePath,
          is_official: true,
          license_class: storagePath || textPayload || Array.isArray(b.questions)
            ? "user_upload"
            : "official_public",
          review_state: "in_review",
          mime_type: storagePath
            ? "application/octet-stream"
            : textPayload
            ? "text/plain"
            : null,
          language,
          metadata: {
            ingest: true,
            has_text_payload: Boolean(textPayload),
            has_questions_payload: Array.isArray(b.questions),
            note:
              "Admin-registered. Remote fetch skipped (robots/terms unknown). Content only from authorized admin upload.",
          },
        })
        .select("id")
        .single();

      if (srcErr || !src) {
        console.error("[ingest-source-document] source insert:", srcErr);
        return errorResponse("Failed to register source", "INTERNAL", 500, req);
      }
      sourceId = src.id as string;
    } else {
      const patch: Record<string, unknown> = {
        title,
        review_state: "in_review",
      };
      if (sourceUrl) patch.source_url = sourceUrl;
      if (storagePath) patch.storage_path = storagePath;
      if (documentType) patch.document_type = documentType;
      await db.from("gov_official_sources").update(patch).eq("id", sourceId);
    }

    // ── Create durable job ─────────────────────────────────────────────────
    const { data: job, error: jobErr } = await db
      .from("source_ingestion_jobs")
      .insert({
        source_id: sourceId,
        created_by: auth.userId,
        status: "queued" satisfies JobStatus,
        parser_version: PARSER_VERSION,
        started_at: new Date().toISOString(),
        metadata: {
          examId,
          stageId,
          year: Number.isFinite(year) ? year : null,
          language,
          cycle,
          tier,
          shift,
          hasTextPayload: Boolean(textPayload),
          hasQuestions: Array.isArray(b.questions),
          storagePath,
          downloadRemote: false,
        },
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("[ingest-source-document] job insert:", jobErr);
      return errorResponse("Failed to create ingestion job", "INTERNAL", 500, req);
    }

    const jobId = job.id as string;

    try {
      await setJob(db, jobId, { status: "validating_url" satisfies JobStatus });

      if (sourceUrl) {
        const hostCheck = assertOfficialExamUrl(sourceUrl);
        if (!hostCheck.ok) {
          await setJob(db, jobId, {
            status: "failed",
            error: hostCheck.message,
            completed_at: new Date().toISOString(),
          });
          return errorResponse(hostCheck.message, hostCheck.code, 403, req);
        }
      }

      await setJob(db, jobId, { status: "registering_source" satisfies JobStatus });

      const hasStructured = Array.isArray(b.questions);
      if (!hasStructured && !textPayload && !storagePath) {
        await setJob(db, jobId, {
          status: "awaiting_payload" satisfies JobStatus,
          completed_at: new Date().toISOString(),
          metadata: {
            examId,
            stageId,
            note: "Source registered. Awaiting admin-authorized payload (storagePath / textPayload / questions).",
          },
        });
        return successResponse(
          {
            jobId,
            sourceId,
            status: "awaiting_payload",
            message:
              "Source metadata registered. Provide structured questions or storagePath in a follow-up ingest to import.",
            downloadRemote: false,
          },
          undefined,
          200,
          req,
        );
      }

      if (!hasStructured) {
        // Metadata-only / text/storage registered — no MCQ import this pass.
        let paperId: string | null = null;
        if (createPaper && Number.isFinite(year) && year >= 1990) {
          await setJob(db, jobId, { status: "linking_paper" satisfies JobStatus });
          paperId = await findOrCreatePaperShell(db, {
            examId,
            stageId,
            year: Math.floor(year),
            cycle,
            tier,
            shift,
            language,
            sourceId: sourceId!,
            title: title || `${exam.code} ${Math.floor(year)}`,
            officialStatus: "link_only",
            questionCount: null,
            metadata: {
              text_payload_chars: textPayload?.length ?? 0,
              storage_path: storagePath,
            },
          });
        }

        await setJob(db, jobId, {
          status: "completed" satisfies JobStatus,
          paper_id: paperId,
          completed_at: new Date().toISOString(),
          metadata: {
            examId,
            mode: "metadata_only",
            textPayloadChars: textPayload?.length ?? 0,
            textPayloadPreview: textPayload ? textPayload.slice(0, 2000) : null,
            storagePath,
          },
        });

        // Persist text payload reference on the source for admin review
        if (textPayload || storagePath) {
          await db
            .from("gov_official_sources")
            .update({
              storage_path: storagePath,
              metadata: {
                ingest: true,
                text_payload_preview: textPayload
                  ? textPayload.slice(0, 4000)
                  : null,
                text_payload_chars: textPayload?.length ?? 0,
                note:
                  "Admin-authorized upload metadata. Full text retained only in ingestion job audit for pilot.",
              },
            })
            .eq("id", sourceId);
        }

        return successResponse(
          {
            jobId,
            sourceId,
            paperId,
            status: "completed",
            questionsImported: 0,
            message:
              "Source registered without structured questions. Text payload / storage path stored for review; no remote download performed.",
          },
          undefined,
          200,
          req,
        );
      }

      // ── Structured JSON questions ────────────────────────────────────────
      await setJob(db, jobId, {
        status: "validating_questions" satisfies JobStatus,
      });

      const validated = validateIngestQuestionsPayload(b.questions, {
        requireAllValid,
      });
      if (!validated.ok) {
        await setJob(db, jobId, {
          status: "failed",
          error: validated.message,
          completed_at: new Date().toISOString(),
          metadata: { rejected: validated.rejected },
        });
        return errorResponse(validated.message, validated.code, 400, req);
      }

      await setJob(db, jobId, {
        status: "inserting_questions" satisfies JobStatus,
      });

      const examType =
        legacyExamType ||
        (exam.legacy_exam_type as string | null) ||
        (exam.code as string);

      const rows = validated.questions.map((q) => ({
        question_text: q.question_text,
        question_type: "MCQ",
        options: q.options.map((text, i) => ({
          label: String.fromCharCode(65 + i),
          text,
        })),
        correct_answer: q.correct_letter,
        explanation: q.explanation ?? "",
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        exam_type: examType,
        source: "OFFICIAL_PYP",
        source_year: Number.isFinite(year) ? Math.floor(year) : null,
        source_paper: title.slice(0, 200),
        is_verified: false,
        is_public: false, // provenance: hidden until approved
        uploaded_by: auth.userId,
        marks_positive: 1,
        marks_negative: 0,
        latex_present: /[=+\-*/^$\\]/.test(q.question_text),
      }));

      const { data: insertedQs, error: qErr } = await db
        .from("questions")
        .insert(rows)
        .select("id");

      if (qErr || !insertedQs) {
        console.error("[ingest-source-document] questions insert:", qErr);
        await setJob(db, jobId, {
          status: "failed",
          error: qErr?.message ?? "Question insert failed",
          completed_at: new Date().toISOString(),
        });
        return errorResponse("Failed to insert questions", "INTERNAL", 500, req);
      }

      let paperId: string | null = null;
      if (createPaper && Number.isFinite(year) && year >= 1990) {
        await setJob(db, jobId, { status: "linking_paper" satisfies JobStatus });
        paperId = await findOrCreatePaperShell(db, {
          examId,
          stageId,
          year: Math.floor(year),
          cycle,
          tier,
          shift,
          language,
          sourceId: sourceId!,
          title: title || `${exam.code} ${Math.floor(year)}`,
          officialStatus: "admin_attested",
          questionCount: insertedQs.length,
          metadata: {
            parser_version: PARSER_VERSION,
            rejected_count: validated.rejected.length,
          },
        });

        if (paperId) {
          await db
            .from("previous_year_papers")
            .update({
              marking: { positive: 1, negative: 0 },
              notes:
                "Draft from admin structured JSON ingest. Questions is_public=false until approved.",
            })
            .eq("id", paperId);

          const links = insertedQs.map((row, i) => ({
            paper_id: paperId,
            question_id: row.id,
            sort_order: i,
            page_ref: validated.questions[i]?.page_ref ?? null,
            section_code: validated.questions[i]?.section_code ?? null,
          }));
          const { error: linkErr } = await db
            .from("previous_year_paper_questions")
            .upsert(links, { onConflict: "paper_id,question_id" });
          if (linkErr) {
            console.error("[ingest-source-document] link:", linkErr.message);
          }
        }
      }

      await setJob(db, jobId, {
        status: "completed" satisfies JobStatus,
        paper_id: paperId,
        questions_imported: insertedQs.length,
        completed_at: new Date().toISOString(),
        metadata: {
          examId,
          rejected: validated.rejected,
          parser_version: PARSER_VERSION,
        },
      });

      return successResponse(
        {
          jobId,
          sourceId,
          paperId,
          status: "completed",
          questionsImported: insertedQs.length,
          rejected: validated.rejected,
          message:
            "Questions imported with is_public=false. Approve paper/questions before public use.",
        },
        undefined,
        200,
        req,
      );
    } catch (procErr) {
      const msg = procErr instanceof Error ? procErr.message : "Processing failed";
      console.error("[ingest-source-document] process:", procErr);
      await setJob(db, jobId, {
        status: "failed",
        error: msg,
        completed_at: new Date().toISOString(),
      });
      return errorResponse(msg, "INTERNAL", 500, req);
    }
  } catch (err) {
    console.error("[ingest-source-document]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("Admin") ? 403 : 500;
    return errorResponse(message, "INTERNAL", status, req);
  }
});
