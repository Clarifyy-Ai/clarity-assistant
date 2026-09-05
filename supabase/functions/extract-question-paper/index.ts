/**
 * extract-question-paper — admin-only PDF/OCR extract into gov previous-year bank.
 *
 * - Accepts pdfBase64 / storagePath / textPayload / structured questions
 * - Never scrapes or downloadRemote
 * - Creates source_ingestion_jobs with extracting/normalizing stages
 * - Inserts questions is_public=false, metadata.needs_review=true
 * - Links previous_year_papers when exam/year provided
 * - Never auto-publishes OCR output
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
import { validateIngestQuestionsPayload } from "../_shared/ingestJsonQuestions.ts";
import { geminiGenerate, geminiGenerateWithPdf, parseJSON } from "../_shared/gemini.ts";
import { getAiFeaturePolicy } from "../_shared/aiFeaturePolicy.ts";
import {
  EXTRACT_PARSER_VERSION,
  PDF_QUESTION_EXTRACT_PROMPT,
  bufferToBase64,
  buildOcrConfidenceFlags,
  classifyAnswerKeyStatus,
  normalizePdfExtractedQuestions,
  parsePlainTextMcqs,
  pythonDocumentExtractText,
  validateExtractQuestionPaperPayload,
  type ExtractPayloadOk,
} from "../_shared/pdfQuestionExtract.ts";
import { callPythonProcess, isPythonConfigured } from "../_shared/pythonClient.ts";
import { scoreQuestionQuality } from "../_shared/govQualityScore.ts";
import { normalizeMcqOptions, resolveCorrectIndex } from "../_shared/govMcqValidator.ts";
import type { QuestionValidationInput } from "../_shared/govAutoApproval.ts";
import { evaluateAndApplyQuestionBatch } from "../_shared/govAutoApprovalPipeline.ts";

type JobStatus =
  | "queued"
  | "registering_source"
  | "extracting"
  | "normalizing"
  | "validating_questions"
  | "inserting_questions"
  | "linking_paper"
  | "completed"
  | "failed";

async function tryPythonPdfText(
  pdfBase64: string,
  correlationId: string,
): Promise<string | null> {
  if (!isPythonConfigured()) return null;
  const result = await callPythonProcess({
    operation: "document_extract",
    operationId: correlationId,
    correlationId,
    payload: {
      base64: pdfBase64,
      filename: "gov-exam-paper.pdf",
      mime_type: "application/pdf",
      document_kind: "exam_paper",
      category_hint: "exam_paper",
    },
  });
  if (!result.ok) {
    console.warn("[extract-question-paper] python document_extract failed:", result.message);
    return null;
  }
  const text = pythonDocumentExtractText(result.data as Record<string, unknown>);
  return text.trim() ? text : null;
}

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

/** "none" only when status is omitted AND no questions were processed. */
function defaultAnswerKeyStatus(
  status: "mapped" | "needs_review" | "none" | undefined,
  questionsProcessed: number | null | undefined,
): "mapped" | "needs_review" | "none" {
  if (status) return status;
  return (questionsProcessed ?? 0) > 0 ? "needs_review" : "none";
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
    answerKeyStatus?: "mapped" | "needs_review" | "none";
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
        review_status: "in_review",
        answer_key_status: defaultAnswerKeyStatus(args.answerKeyStatus, args.questionCount),
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
      answer_key_status: defaultAnswerKeyStatus(args.answerKeyStatus, args.questionCount),
      review_status: "in_review",
      title: args.title,
      question_count: args.questionCount,
      notes:
        "OCR/PDF extract draft. Questions is_public=false until reviewer approval.",
      metadata: args.metadata,
    })
    .select("id")
    .single();

  if (insErr) {
    console.warn("[extract-question-paper] paper shell:", insErr.message);
    return null;
  }
  return (inserted?.id as string) ?? null;
}

async function resolvePdfBase64(
  db: ReturnType<typeof createServiceClient>,
  payload: ExtractPayloadOk,
): Promise<{ base64: string | null; error?: string }> {
  if (payload.pdfBase64) return { base64: payload.pdfBase64 };
  if (!payload.storagePath) return { base64: null };

  // Admin-authorized storage path only (bucket/object). Never remote URL.
  const path = payload.storagePath.replace(/^\/+/, "");
  const slash = path.indexOf("/");
  if (slash <= 0) {
    return {
      base64: null,
      error: "storagePath must be bucket/object (e.g. exam-sources/paper.pdf)",
    };
  }
  const bucket = path.slice(0, slash);
  const objectPath = path.slice(slash + 1);
  const { data, error } = await db.storage.from(bucket).download(objectPath);
  if (error || !data) {
    return {
      base64: null,
      error: error?.message ?? "Failed to download storage object",
    };
  }
  const buf = await data.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) {
    return { base64: null, error: "Stored PDF exceeds 15MB limit" };
  }
  return { base64: bufferToBase64(buf) };
}

const ASYNC_PDF_B64_CHARS = 500_000;

function scheduleWaitUntil(task: Promise<unknown>): boolean {
  try {
    const er = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(
        task.catch((err) => {
          console.error("[extract-question-paper] background:", err);
        }),
      );
      return true;
    }
  } catch {
    // ignore
  }
  return false;
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
      key: createRateLimitKey("extract-question-paper", auth.userId),
      ...RATE_LIMIT_PRESETS.BULK_INGEST,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json().catch(() => null);
    const validated = validateExtractQuestionPaperPayload(body);
    if (!validated.ok) {
      return errorResponse(validated.message, validated.code, 400, req);
    }
    const payload = validated;

    const { data: exam, error: examErr } = await db
      .from("gov_exams")
      .select("id, code, recruiting_body_id, legacy_exam_type")
      .eq("id", payload.examId)
      .maybeSingle();

    if (examErr || !exam) {
      return errorResponse("Exam not found", "NOT_FOUND", 404, req);
    }

    // ── Register / update source ───────────────────────────────────────────
    let sourceId = payload.sourceId;
    if (!sourceId) {
      const { data: src, error: srcErr } = await db
        .from("gov_official_sources")
        .insert({
          recruiting_body_id: exam.recruiting_body_id,
          exam_id: payload.examId,
          document_type: payload.documentType,
          title: payload.title,
          source_url: null,
          storage_path: payload.storagePath,
          is_official: payload.licenseClass === "official_public" ||
            payload.licenseClass === "licensed",
          license_class: payload.licenseClass,
          review_state: "in_review",
          mime_type: payload.pdfBase64 || payload.storagePath
            ? "application/pdf"
            : payload.textPayload
            ? "text/plain"
            : "application/json",
          language: payload.language,
          metadata: {
            extract: true,
            mode: payload.mode,
            note:
              "Admin-authorized PDF/OCR extract. No remote scrape. Awaiting reviewer approval before public.",
          },
        })
        .select("id")
        .single();

      if (srcErr || !src) {
        console.error("[extract-question-paper] source insert:", srcErr);
        return errorResponse("Failed to register source", "INTERNAL", 500, req);
      }
      sourceId = src.id as string;
    } else {
      const patch: Record<string, unknown> = {
        title: payload.title,
        review_state: "in_review",
        license_class: payload.licenseClass,
      };
      if (payload.storagePath) patch.storage_path = payload.storagePath;
      await db.from("gov_official_sources").update(patch).eq("id", sourceId);
    }

    const { data: job, error: jobErr } = await db
      .from("source_ingestion_jobs")
      .insert({
        source_id: sourceId,
        created_by: auth.userId,
        status: "queued" satisfies JobStatus,
        parser_version: EXTRACT_PARSER_VERSION,
        started_at: new Date().toISOString(),
        metadata: {
          kind: "extract_question_paper",
          examId: payload.examId,
          stageId: payload.stageId,
          year: payload.year,
          language: payload.language,
          mode: payload.mode,
          licenseClass: payload.licenseClass,
          storagePath: payload.storagePath,
          auto_publish: false,
        },
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("[extract-question-paper] job insert:", jobErr);
      return errorResponse("Failed to create ingestion job", "INTERNAL", 500, req);
    }

    const jobId = job.id as string;
    const pdfChars = typeof payload.pdfBase64 === "string" ? payload.pdfBase64.length : 0;
    const heavyPdf =
      pdfChars > ASYNC_PDF_B64_CHARS ||
      Boolean(payload.storagePath && !payload.hasQuestionsArray && !payload.textPayload);

    const runProcess = async (): Promise<Response> => {
    let rawOcrText: string | null = null;
    let rawQuestions: unknown[] = [];

    try {
      await setJob(db, jobId, {
        status: "registering_source" satisfies JobStatus,
      });

      const bodyObj = (body && typeof body === "object"
        ? body
        : {}) as Record<string, unknown>;

      if (payload.hasQuestionsArray) {
        rawQuestions = Array.isArray(bodyObj.questions)
          ? (bodyObj.questions as unknown[])
          : [];
        rawOcrText = JSON.stringify(rawQuestions).slice(0, 20_000);
      } else {
        await setJob(db, jobId, { status: "extracting" satisfies JobStatus });

        if (payload.textPayload && !payload.pdfBase64 && !payload.storagePath) {
          rawOcrText = payload.textPayload;
          const deterministic = parsePlainTextMcqs(payload.textPayload);
          if (deterministic.length > 0) {
            rawQuestions = deterministic;
          } else {
            try {
              const textPrompt =
                `${PDF_QUESTION_EXTRACT_PROMPT}\n\n--- DOCUMENT TEXT ---\n${payload.textPayload.slice(0, 120_000)}`;
              const rawText = await geminiGenerate(
                textPrompt,
                undefined,
                0.2,
                getAiFeaturePolicy("extract_question_paper").maxOutputTokens,
              );
              rawOcrText = rawText;
              const parsed = parseJSON<{ questions?: unknown[] }>(rawText, {
                questions: [],
              });
              rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
            } catch (aiErr) {
              const aiMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
              console.error("[extract-question-paper] AI text parse failed:", aiMsg);
              throw new Error(
                "AI text extraction is unavailable. Paste clearer MCQ text (Q1/A)/B)/C)/D)/Answer) or fix the AI provider key.",
              );
            }
          }
        } else {
          const pdf = await resolvePdfBase64(db, payload);
          if (!pdf.base64) {
            await setJob(db, jobId, {
              status: "failed",
              error: pdf.error ?? "No PDF content",
              completed_at: new Date().toISOString(),
            });
            return errorResponse(
              pdf.error ?? "No PDF content",
              "NO_PDF",
              400,
              req,
            );
          }
          const correlationId = String(jobId);
          const extractPolicy = getAiFeaturePolicy("extract_question_paper");
          let rawText: string | null = await tryPythonPdfText(pdf.base64, correlationId);
          if (rawText) {
            const deterministic = parsePlainTextMcqs(rawText);
            if (deterministic.length > 0) {
              rawOcrText = rawText;
              rawQuestions = deterministic;
            }
          }
          if (rawQuestions.length === 0) {
            try {
              rawText = await geminiGenerateWithPdf(
                PDF_QUESTION_EXTRACT_PROMPT,
                pdf.base64,
                { temperature: 0.2, maxTokens: extractPolicy.maxOutputTokens },
              );
            } catch (geminiErr) {
              console.warn("[extract-question-paper] Gemini PDF extract failed:", geminiErr);
              if (!rawText) throw geminiErr;
            }
            if (!rawText) {
              throw new Error("PDF extraction failed via AI and Python services.");
            }
            rawOcrText = rawText;
            const deterministic = parsePlainTextMcqs(rawText);
            if (deterministic.length > 0) {
              rawQuestions = deterministic;
            } else {
              const parsed = parseJSON<{ questions?: unknown[] }>(rawText, {
                questions: [],
              });
              rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
            }
          }
        }
      }

      await setJob(db, jobId, { status: "normalizing" satisfies JobStatus });
      const normalizedRaw = normalizePdfExtractedQuestions(rawQuestions);
      const confidence = buildOcrConfidenceFlags(normalizedRaw);

      await setJob(db, jobId, {
        status: "validating_questions" satisfies JobStatus,
        metadata: {
          kind: "extract_question_paper",
          examId: payload.examId,
          mode: payload.mode,
          raw_ocr_preview: rawOcrText ? rawOcrText.slice(0, 4000) : null,
          raw_ocr_chars: rawOcrText?.length ?? 0,
          confidence_summary: {
            low: confidence.filter((c) => c.score < 0.7).length,
            flagged: confidence.filter((c) => c.flags.length > 0).length,
            total: confidence.length,
          },
          auto_publish: false,
        },
      });

      const validatedQs = validateIngestQuestionsPayload(normalizedRaw, {
        requireAllValid: payload.requireAllValid,
      });
      if (!validatedQs.ok) {
        await setJob(db, jobId, {
          status: "failed",
          error: validatedQs.message,
          completed_at: new Date().toISOString(),
          metadata: {
            kind: "extract_question_paper",
            rejected: validatedQs.rejected,
            confidence,
            raw_ocr_preview: rawOcrText ? rawOcrText.slice(0, 4000) : null,
            answer_key_status: "needs_review",
          },
        });
        return errorResponse(validatedQs.message, validatedQs.code, 400, req);
      }

      const answerKeyStatus = classifyAnswerKeyStatus({
        raw: normalizedRaw,
        acceptedCount: validatedQs.questions.length,
        rejected: validatedQs.rejected,
        confidence,
      });
      const answerUncertain = answerKeyStatus === "needs_review";

      await setJob(db, jobId, {
        status: "inserting_questions" satisfies JobStatus,
      });

      const examType =
        payload.legacyExamType ||
        (exam.legacy_exam_type as string | null) ||
        (exam.code as string);

      const licenseTypeFromClass = (licenseClass: string): string => {
        switch (licenseClass) {
          case "official_public":
            return "PUBLIC_DOMAIN";
          case "licensed":
            return "LICENSED";
          case "institution":
            return "INTERNAL";
          case "user_upload":
            return "USER_OWNED";
          case "ai_generated":
            return "ORIGINAL";
          default:
            return "PUBLIC_DOMAIN";
        }
      };

      const rows = validatedQs.questions.map((q, i) => {
        const conf = confidence[i];
        const rawItem = rawQuestions[i];
        return {
          question_text: q.question_text,
          question_type: "MCQ",
          options: q.options.map((text, oi) => ({
            label: String.fromCharCode(65 + oi),
            text,
          })),
          correct_answer: q.correct_letter,
          explanation: q.explanation ?? "",
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
          exam_type: examType,
          source: "OFFICIAL_PYP",
          source_year: payload.year,
          source_paper: payload.title.slice(0, 200),
          is_verified: false,
          is_public: false, // never auto-publish OCR
          review_status: "review_required",
          validation_status: "valid",
          license_type: licenseTypeFromClass(payload.licenseClass),
          publish_status: "draft",
          uploaded_by: auth.userId,
          marks_positive: 1,
          marks_negative: 0,
          latex_present: /[=+\-*/^$\\]/.test(q.question_text),
          metadata: {
            needs_review: true,
            answer_key_uncertain: answerUncertain,
            answer_key_status: answerKeyStatus,
            provenance: "pdf_extract",
            parser_version: EXTRACT_PARSER_VERSION,
            license_class: payload.licenseClass,
            job_id: jobId,
            ocr: {
              raw: rawItem ?? null,
              normalized: {
                question_text: q.question_text,
                options: q.options,
                correct_letter: q.correct_letter,
              },
              confidence: conf ?? null,
            },
          },
        };
      });

      const { data: insertedQs, error: qErr } = await db
        .from("questions")
        .insert(rows)
        .select("id");

      if (qErr || !insertedQs) {
        console.error("[extract-question-paper] questions insert:", qErr);
        await setJob(db, jobId, {
          status: "failed",
          error: qErr?.message ?? "Question insert failed",
          completed_at: new Date().toISOString(),
        });
        // If metadata column missing remotely, surface clear error
        const hint = qErr?.message?.includes("metadata")
          ? " Apply migration 20260802150000_extract_question_paper_ocr."
          : "";
        return errorResponse(
          `Failed to insert questions.${hint}`,
          "INTERNAL",
          500,
          req,
        );
      }

      const autoApprovalItems: Array<{
        id: string;
        validation: QuestionValidationInput;
        provenance: Record<string, unknown>;
        processingJobId: string;
      }> = [];

      for (let i = 0; i < insertedQs.length; i++) {
        const qRow = validatedQs.questions[i];
        const qId = insertedQs[i]?.id as string | undefined;
        if (!qId || !qRow) continue;
        const conf = confidence[i];
        const options = qRow.options;
        const quality = scoreQuestionQuality({
          question_text: qRow.question_text,
          options,
          correct_index: resolveCorrectIndex(qRow.correct_letter, options.length) ?? 0,
          sourceConfidence: conf?.score ?? 0.7,
        });
        const ocrUncertain = answerUncertain || (conf?.score ?? 1) < 0.7;
        autoApprovalItems.push({
          id: qId,
          processingJobId: jobId,
          validation: {
            entityType: "question",
            questionId: qId,
            sourceType: payload.licenseClass === "official_public"
              ? "verified_public_source"
              : "official_verified",
            qualityScore: quality.score,
            qualityHardFail: quality.hardFail,
            hardFailCodes: quality.hardFailCodes,
            duplicateStatus: "unique",
            hasProvenance: true,
            hasValidExam: Boolean(examType),
            hasValidStage: Boolean(payload.stageId),
            hasValidSection: Boolean(qRow.section_code),
            hasValidSubject: Boolean(qRow.subject),
            hasValidLanguage: Boolean(payload.language),
            hasValidOptions: options.length >= 2,
            hasValidAnswer: !quality.hardFailCodes.includes("MCQ_STRUCTURE_INVALID"),
            hasValidDifficulty: ["EASY", "MEDIUM", "HARD"].includes(String(qRow.difficulty).toUpperCase()),
            ocrUncertainty: ocrUncertain,
            answerKeyConflict: answerKeyStatus === "needs_review",
            policyViolation: false,
            unresolvedReviewFlag: true,
            sourceApproved: payload.licenseClass === "official_public" || payload.licenseClass === "licensed",
            examId: payload.examId,
            language: payload.language ?? null,
            processingJobId: jobId,
          },
          provenance: {
            provenance: "pdf_extract",
            job_id: jobId,
            license_class: payload.licenseClass,
          },
        });
      }

      const autoApprovalResults = await evaluateAndApplyQuestionBatch(db, autoApprovalItems);

      let paperId: string | null = null;
      if (payload.createPaper && payload.year != null) {
        await setJob(db, jobId, { status: "linking_paper" satisfies JobStatus });
        paperId = await findOrCreatePaperShell(db, {
          examId: payload.examId,
          stageId: payload.stageId,
          year: payload.year,
          cycle: payload.cycle,
          tier: payload.tier,
          shift: payload.shift,
          language: payload.language,
          sourceId: sourceId!,
          title: payload.title || `${exam.code} ${payload.year}`,
          officialStatus: "admin_attested",
          questionCount: insertedQs.length,
          answerKeyStatus,
          metadata: {
            parser_version: EXTRACT_PARSER_VERSION,
            extract_mode: payload.mode,
            license_class: payload.licenseClass,
            ocr_confidence: {
              low: confidence.filter((c) => c.score < 0.7).length,
              flagged: confidence.filter((c) => c.flags.length > 0).length,
            },
            auto_publish: false,
          },
        });

        if (paperId) {
          const links = insertedQs.map((row, i) => ({
            paper_id: paperId,
            question_id: row.id,
            sort_order: i,
            page_ref: validatedQs.questions[i]?.page_ref ?? null,
            section_code: validatedQs.questions[i]?.section_code ?? null,
          }));
          const { error: linkErr } = await db
            .from("previous_year_paper_questions")
            .upsert(links, { onConflict: "paper_id,question_id" });
          if (linkErr) {
            console.error("[extract-question-paper] link:", linkErr.message);
          }
        }
      }

      const lowConfidence = confidence.filter((c) => c.score < 0.7);

      await setJob(db, jobId, {
        status: "completed" satisfies JobStatus,
        paper_id: paperId,
        questions_imported: insertedQs.length,
        completed_at: new Date().toISOString(),
        metadata: {
          kind: "extract_question_paper",
          examId: payload.examId,
          mode: payload.mode,
          rejected: validatedQs.rejected,
          confidence,
          raw_ocr_preview: rawOcrText ? rawOcrText.slice(0, 4000) : null,
          normalized_count: validatedQs.questions.length,
          auto_publish: false,
          needs_review: true,
          auto_approval: autoApprovalResults,
        },
      });

      await db
        .from("gov_official_sources")
        .update({
          storage_path: payload.storagePath,
          metadata: {
            extract: true,
            last_job_id: jobId,
            questions_imported: insertedQs.length,
            needs_review: true,
            license_class: payload.licenseClass,
          },
        })
        .eq("id", sourceId);

      return successResponse(
        {
          jobId,
          sourceId,
          paperId,
          status: "completed",
          questionsImported: insertedQs.length,
          rejected: validatedQs.rejected,
          confidenceFlags: confidence,
          lowConfidenceCount: lowConfidence.length,
          autoPublish: false,
          message:
            "OCR/PDF extract imported with is_public=false and needs_review. Approve in Q Review before public use.",
        },
        undefined,
        200,
        req,
      );
    } catch (procErr) {
      const msg = procErr instanceof Error ? procErr.message : "Processing failed";
      console.error("[extract-question-paper] process:", procErr);
      await setJob(db, jobId, {
        status: "failed",
        error: msg.slice(0, 500),
        completed_at: new Date().toISOString(),
        metadata: {
          kind: "extract_question_paper",
          raw_ocr_preview: rawOcrText ? rawOcrText.slice(0, 4000) : null,
        },
      });
      const parserish =
        /timeout|gemini|openai|provider|api key|INVALID_ARGUMENT|fetch failed|AbortError|timed out|AI text extraction/i.test(
          msg,
        );
      const isTimeout = /timeout|timed out|AbortError|504|deadline exceeded/i.test(msg);
      return errorResponse(
        parserish
          ? "PDF/text parsing failed. Use clearer pasted MCQ text, a smaller PDF, or check AI provider configuration."
          : "Ingestion failed. Please retry or contact support.",
        parserish ? "PARSER_FAILED" : "INTERNAL",
        isTimeout ? 504 : parserish ? 502 : 500,
        req,
      );
    }
    };

    if (heavyPdf) {
      const background = runProcess().then((res) => {
        if (!res.ok) {
          console.warn("[extract-question-paper] async finished", jobId, res.status);
        }
      });
      if (!scheduleWaitUntil(background)) {
        void background;
      }
      return successResponse(
        {
          jobId,
          sourceId,
          paperId: null,
          status: "queued",
          async: true,
          questionsImported: 0,
          autoPublish: false,
          message:
            "Ingestion queued. Poll Recent jobs for completion. Questions stay unpublished until review.",
        },
        undefined,
        202,
        req,
      );
    }

    return await runProcess();
  } catch (err) {
    console.error("[extract-question-paper]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("Admin") ? 403 : 500;
    return errorResponse(message, "INTERNAL", status, req);
  }
});
